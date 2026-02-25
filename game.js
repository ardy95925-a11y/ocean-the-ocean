// game.js — Deep Dive main engine

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ── canvas size
let W = 0, H = 0;

// ── world constants
const WORLD_W    = 4000;
const WORLD_DEEP = 3200;   // max world depth in px
const SURF_FRAC  = 0.32;   // fraction of screen for surface

// ── time
let lastTime = 0;
let globalT  = 0;

// ── game state
let STATE = 'menu'; // menu | playing | over

// ── singletons
let shop, water, boat;

// ── camera (world coords of top-left)
let camX = 0, camY = 0;

// ── player
const PL = {
  x:0, y:0, vx:0, vy:0,
  w:26, h:44,
  inWater: false,   // submerged below surface
  onBoat:  true,    // standing on boat (can't move underwater)
  air: 30, maxAir: 30,
  angle: 0,
  armT:  0,
  trail: [],
  bubbles: [],
};

// ── stats cache
let ST = {};

// ── run data
let runCoins = 0, runMaxDepth = 0;
let rCoins = { coral:0, gem:0, shell:0, chest:0 };

// ── world objects
let resources=[], seaweeds=[], corals=[], fishes=[], jellies=[], dolphins=[];
let particles=[], splashes=[];

// ── input
const keys = {};
const touch = { up:false, down:false, left:false, right:false };

// ────────────────────────────────────────────────────────────
//  INIT
// ────────────────────────────────────────────────────────────
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  if (water) water.baseY = H * SURF_FRAC;
}

function init() {
  shop = new ShopManager();
  shop._refreshMoney();
  resize();
  bindInput();
  bindUI();
  // Menu canvas background
  initMenuCanvas();
  requestAnimationFrame(mainLoop);
}

// ── menu animated canvas
let menuWater;
function initMenuCanvas() {
  const mc = document.getElementById('menu-canvas');
  if (!mc) return;
  mc.width  = window.innerWidth;
  mc.height = window.innerHeight;
  menuWater = new WaterPhysics(mc.width, 80);
  menuWater.baseY = mc.height * 0.55;
  animateMenu(mc);
}

function animateMenu(mc) {
  if (STATE !== 'menu') return;
  const mctx = mc.getContext('2d');
  const mW = mc.width, mH = mc.height;
  globalT += 0.016;
  menuWater.update();
  if (Math.random() < 0.03) menuWater.splash(Math.random()*mW, rand(-2,2));

  // Sky
  const sg = mctx.createLinearGradient(0,0,0,mH);
  sg.addColorStop(0,'#000814');
  sg.addColorStop(0.5,'#001a3a');
  sg.addColorStop(1,'#003070');
  mctx.fillStyle = sg;
  mctx.fillRect(0,0,mW,mH);

  // Stars
  mctx.fillStyle='rgba(255,255,255,0.7)';
  for(let i=0;i<60;i++){
    const sx=(i*137.5)%mW, sy=(i*73)%(menuWater.baseY*0.8);
    const twink=0.4+0.6*Math.sin(globalT*2+i);
    mctx.globalAlpha=twink*0.8;
    mctx.beginPath();mctx.arc(sx,sy,0.9,0,Math.PI*2);mctx.fill();
  }
  mctx.globalAlpha=1;

  // Moon
  const moonX=mW*0.8, moonY=60;
  const mg=mctx.createRadialGradient(moonX,moonY,0,moonX,moonY,45);
  mg.addColorStop(0,'rgba(255,248,220,0.95)');
  mg.addColorStop(0.5,'rgba(255,240,180,0.5)');
  mg.addColorStop(1,'transparent');
  mctx.fillStyle=mg; mctx.fillRect(moonX-45,moonY-45,90,90);
  mctx.beginPath();mctx.arc(moonX,moonY,24,0,Math.PI*2);
  mctx.fillStyle='rgba(255,248,220,0.95)';mctx.fill();

  // Moon glow rays
  for(let r=0;r<3;r++){
    mctx.beginPath();
    mctx.moveTo(moonX,menuWater.baseY);
    mctx.lineTo(moonX+(r-1)*40, menuWater.baseY);
    mctx.strokeStyle=`rgba(255,240,180,${0.04-r*0.01})`;
    mctx.lineWidth=40-r*10;
    mctx.stroke();
  }

  menuWater.draw(mctx,0,0,mW,mH,globalT);

  // Depth silhouette
  mctx.fillStyle='rgba(0,10,30,0.9)';
  mctx.fillRect(0,menuWater.baseY+8,mW,mH);

  requestAnimationFrame(()=>animateMenu(mc));
}

// ────────────────────────────────────────────────────────────
//  START GAME
// ────────────────────────────────────────────────────────────
function startGame() {
  ST = shop.getStats();

  water = new WaterPhysics(WORLD_W, 160);
  water.baseY = H * SURF_FRAC;

  boat = new BoatPhysics(W * 0.5);

  // Reset player — place on boat
  PL.x = boat.x;
  PL.y = water.baseY - 80;
  PL.vx = PL.vy = 0;
  PL.onBoat  = true;
  PL.inWater = false;
  PL.air = PL.maxAir = ST.maxAir;
  PL.angle = 0;
  PL.trail = [];
  PL.bubbles = [];

  // Reset camera
  camX = Math.max(0, PL.x - W*0.5);
  camY = 0;

  // Reset run
  runCoins=0; runMaxDepth=0;
  rCoins={coral:0,gem:0,shell:0,chest:0};

  // Generate world
  genWorld();

  STATE = 'playing';
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('touch-controls').classList.remove('hidden');

  // Show tutorial first time
  if (!localStorage.getItem('dd_tut')) {
    document.getElementById('tut-overlay').classList.remove('hidden');
    localStorage.setItem('dd_tut','1');
  }

  updateHUD();
}

// ────────────────────────────────────────────────────────────
//  WORLD GENERATION
// ────────────────────────────────────────────────────────────
function genWorld() {
  resources=[];seaweeds=[];corals=[];fishes=[];jellies=[];dolphins=[];particles=[];splashes=[];

  const wY  = water.baseY;
  const maxD= WORLD_DEEP;

  // Seaweeds — anchored to ocean floor columns
  for(let i=0;i<90;i++){
    seaweeds.push({
      x: rand(80, WORLD_W-80),
      y: wY + rand(100, maxD-100),
      h: rand(50,140),
      sway: rand(0,Math.PI*2),
      color: randPick(['#1d8a30','#0e6320','#2ec44a','#157030','#0a4e1c']),
      segments: Math.floor(rand(5,9)),
    });
  }

  // Corals — on the floor
  for(let i=0;i<70;i++){
    corals.push({
      x: rand(60, WORLD_W-60),
      y: wY + rand(80, maxD-80),
      size: rand(18,60),
      type: Math.floor(rand(0,5)),
      color: randPick(['#ff5a5a','#ff9040','#ff50a0','#ffd700','#b090ff','#40e0ff','#ff70b0']),
      color2: randPick(['#ff8080','#ffb060','#ff80c0','#ffe060','#d0b0ff','#80f0ff']),
    });
  }

  // Resources — scattered at depth
  const RES_TYPES = [
    {type:'coral', value:10, color:'#ff6060'},
    {type:'gem',   value:45, color:'#40d0ff'},
    {type:'shell', value:22, color:'#ffd060'},
  ];
  for(let i=0;i<100;i++){
    const rt = randPick(RES_TYPES);
    resources.push({
      id:i, type:rt.type, glowColor:rt.color, value:rt.value,
      x: rand(60,WORLD_W-60),
      y: wY + rand(60, maxD-80),
      gT: rand(0,Math.PI*2),
      collected:false,
    });
  }

  // Treasure chests
  if(ST.tmap){
    for(let i=0;i<6;i++){
      resources.push({
        id:1000+i, type:'chest', glowColor:'#ffd700', value:200,
        x: rand(100,WORLD_W-100),
        y: wY + rand(300, maxD-100),
        gT: rand(0,Math.PI*2),
        collected:false,
      });
    }
  }

  // Fish schools
  const FISH_COLS=['#ffd060','#ff6060','#40d0ff','#a0eea0','#ff9040','#80b0ff','#ffb080'];
  for(let s=0;s<25;s++){
    const fx=rand(100,WORLD_W-100), fy=wY+rand(50,800);
    const fc=randPick(FISH_COLS);
    const count=Math.floor(rand(3,8));
    for(let j=0;j<count;j++){
      fishes.push({
        x:fx+rand(-80,80), y:fy+rand(-40,40),
        vx:rand(-1.5,1.5)||0.5, vy:rand(-0.4,0.4),
        size:rand(7,14), color:fc, school:s,
        t:rand(0,Math.PI*2),
      });
    }
  }

  // Jellyfish (mid-deep)
  const JC=['rgba(255,100,200,0.85)','rgba(100,200,255,0.85)','rgba(200,100,255,0.85)','rgba(255,160,60,0.8)'];
  for(let i=0;i<20;i++){
    jellies.push({
      x:rand(100,WORLD_W-100),
      y:wY+rand(200,maxD-200),
      size:rand(18,40),
      color:randPick(JC),
      t:rand(0,Math.PI*2),
      pulse:rand(0,Math.PI*2),
    });
  }

  // Dolphin (if owned)
  if(ST.buddy){
    dolphins.push({x:boat.x+100, y:water.baseY-30, vx:0, vy:0, t:0});
  }
}

// ────────────────────────────────────────────────────────────
//  MAIN LOOP
// ────────────────────────────────────────────────────────────
function mainLoop(ts) {
  requestAnimationFrame(mainLoop);
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  globalT  = ts * 0.001;

  if (STATE === 'playing') gameUpdate(dt, ts);
  gameRender(ts);
}

// ────────────────────────────────────────────────────────────
//  UPDATE
// ────────────────────────────────────────────────────────────
function gameUpdate(dt, ts) {
  water.update();
  boat.update(dt, water);

  const wY  = water.baseY;
  const spd = 240 * ST.swimSpeed;

  const goUp    = keys['ArrowUp']   ||keys['w']||keys['W']||touch.up;
  const goDown  = keys['ArrowDown'] ||keys['s']||keys['S']||touch.down;
  const goLeft  = keys['ArrowLeft'] ||keys['a']||keys['A']||touch.left;
  const goRight = keys['ArrowRight']||keys['d']||keys['D']||touch.right;

  // ── Player physics
  if (PL.onBoat) {
    // Ride boat
    PL.x = boat.x;
    PL.y = boat.y - 50;
    PL.vx = 0; PL.vy = 0;
  } else if (!PL.inWater) {
    // In air above water (after jumping off boat)
    PL.vy += 400 * dt; // gravity
    PL.x  += PL.vx * dt;
    PL.y  += PL.vy * dt;

    const surfY = water.getY(PL.x);
    if (PL.y >= surfY) {
      // Hit water surface
      PL.y = surfY;
      PL.vy = 0;
      PL.inWater = true;
      water.splash(PL.x, 10);
      spawnSplash(PL.x, surfY, 12);
    }
    // Air refills above surface
    PL.air = Math.min(PL.maxAir, PL.air + dt * 12);
  } else {
    // ── UNDERWATER
    if (goUp)    PL.vy -= spd * dt * 1.5;
    if (goDown)  PL.vy += spd * dt * 0.7;
    if (goLeft)  { PL.vx -= spd * dt; PL.angle = lerp(PL.angle, -0.45, 0.1); }
    if (goRight) { PL.vx += spd * dt; PL.angle = lerp(PL.angle, +0.45, 0.1); }
    if (!goLeft && !goRight) PL.angle = lerp(PL.angle, 0, 0.08);

    // Gentle sinking when not pressing
    if (!goUp) PL.vy += 22 * dt;

    // Water drag
    PL.vx *= 0.84;
    PL.vy *= 0.84;

    PL.x += PL.vx * dt * 60;
    PL.y += PL.vy * dt * 60;

    // Clamp to world
    PL.x = clamp(PL.x, 20, WORLD_W - 20);
    PL.y = clamp(PL.y, wY + 5, wY + WORLD_DEEP);

    // Animate arms
    PL.armT += dt * 4;

    // Air drain
    PL.air -= dt * ST.airDrain;
    if (PL.air <= 0) { PL.air = 0; endRun(); return; }

    // Depth tracking
    const depth = Math.floor(PL.y - wY);
    if (depth > runMaxDepth) runMaxDepth = depth;

    // Check if surfaced
    const surfY = water.getY(PL.x);
    if (PL.y <= surfY) {
      PL.y = surfY;
      PL.vy = Math.abs(PL.vy) * 0.2;
      PL.inWater = false;
      water.splash(PL.x, 6);
      spawnSplash(PL.x, surfY, 8);
    }

    // Magnet pull
    if (ST.magnet > 0) {
      for (const r of resources) {
        if (r.collected) continue;
        const dx = r.x-PL.x, dy = r.y-PL.y;
        const d2 = dx*dx+dy*dy;
        if (d2 < ST.magnet*ST.magnet) {
          const d = Math.sqrt(d2);
          r.x -= (dx/d)*2.5;
          r.y -= (dy/d)*2.5;
        }
      }
    }

    // Bubbles
    if (Math.random() < 0.18) {
      PL.bubbles.push({
        x:PL.x+rand(-10,10), y:PL.y-10,
        vx:rand(-0.4,0.4), vy:rand(-1.5,-0.6),
        r:rand(2,5), life:1,
      });
    }

    // Collect resources
    for (const r of resources) {
      if (r.collected) continue;
      const dx=r.x-PL.x, dy=r.y-PL.y;
      if (dx*dx+dy*dy < 900) { // 30px radius
        collectResource(r);
      }
    }
  }

  // Refill air when floating at surface
  if (!PL.inWater && !PL.onBoat) {
    PL.air = Math.min(PL.maxAir, PL.air + dt * 10);
  }

  // ── Camera follow
  const targetCamX = clamp(PL.x - W*0.5, 0, WORLD_W - W);
  const targetCamY = PL.inWater
    ? clamp(PL.y - H*0.45, 0, WORLD_DEEP)
    : 0;
  camX = lerp(camX, targetCamX, 0.08);
  camY = lerp(camY, targetCamY, 0.06);

  // ── Fish AI
  updateFish(dt);

  // ── Jellyfish drift
  for (const j of jellies) {
    j.t     += dt * 0.7;
    j.pulse += dt * 2.2;
    j.y     += Math.sin(j.t * 0.8) * 0.35;
    j.x     += Math.sin(j.t * 0.4) * 0.18;
  }

  // ── Dolphins
  for (const d of dolphins) {
    d.t += dt;
    const tx = PL.x + 120, ty = water.getY(PL.x) - 20;
    d.vx = lerp(d.vx, (tx-d.x)*0.025, 0.12);
    d.vy = lerp(d.vy, (ty-d.y)*0.025, 0.12);
    d.x += d.vx + Math.cos(d.t*1.8)*0.8;
    d.y += d.vy + Math.sin(d.t*2.4)*1.2;
    if (ST.buddy) {
      for (const r of resources) {
        if (r.collected) continue;
        const dx=r.x-d.x, dy=r.y-d.y;
        if (dx*dx+dy*dy < 2500) collectResource(r);
      }
    }
  }

  // ── Bubbles
  PL.bubbles.forEach(b => { b.x+=b.vx; b.y+=b.vy; b.r*=0.994; b.life-=dt*0.7; });
  PL.bubbles = PL.bubbles.filter(b=>b.life>0&&b.r>0.5);

  // ── Trail
  PL.trail.push({x:PL.x, y:PL.y, life:0.35});
  PL.trail.forEach(t=>t.life-=dt);
  PL.trail = PL.trail.filter(t=>t.life>0);

  // ── Particles
  particles.forEach(p => {
    p.x+=p.vx; p.y+=p.vy;
    p.vy += (p.grav||0);
    p.life -= dt;
  });
  particles = particles.filter(p=>p.life>0);

  // ── Splashes
  splashes.forEach(s => {
    s.vx*=0.9; s.vy+=0.3; s.x+=s.vx; s.y+=s.vy;
    s.life-=dt;
  });
  splashes = splashes.filter(s=>s.life>0);

  updateHUD();
}

function updateFish(dt) {
  for (const f of fishes) {
    f.t += dt;
    // School cohesion
    let cx=0,cy=0,cn=0;
    for (const o of fishes) {
      if (o.school!==f.school) continue;
      const dx=o.x-f.x,dy=o.y-f.y;
      if (dx*dx+dy*dy < 8000) { cx+=o.x; cy+=o.y; cn++; }
    }
    if (cn>1) {
      f.vx += (cx/cn - f.x)*0.0008;
      f.vy += (cy/cn - f.y)*0.0008;
    }
    // Wander
    f.vx += rand(-0.1,0.1);
    f.vy += rand(-0.04,0.04);
    // Speed cap
    const spd=Math.hypot(f.vx,f.vy);
    if (spd>1.8){f.vx=f.vx/spd*1.8;f.vy=f.vy/spd*1.8;}
    if (spd<0.3&&spd>0){f.vx=f.vx/spd*0.3;f.vy=f.vy/spd*0.3;}
    // Flee player
    const px=PL.x-f.x, py=PL.y-f.y;
    const pd=Math.hypot(px,py);
    if (pd<100&&PL.inWater) { f.vx-=px/pd*0.6; f.vy-=py/pd*0.6; }
    // Depth clamp
    if (f.y < water.baseY+20) f.vy+=0.15;
    if (f.y > water.baseY+WORLD_DEEP-100) f.vy-=0.15;
    f.x = clamp(f.x+f.vx, 20, WORLD_W-20);
    f.y += f.vy;
  }
}

function collectResource(r) {
  r.collected = true;
  const coins = Math.round(r.value * ST.cargoMult * (ST.camera&&Math.random()<0.3?1.5:1));
  runCoins += coins;
  if (r.type==='chest') rCoins.chest++;
  else rCoins[r.type] = (rCoins[r.type]||0)+1;
  // Sparkle particles
  for (let i=0;i<8;i++) {
    particles.push({
      x:r.x, y:r.y,
      vx:rand(-2,2)*0.6, vy:rand(-3,0),
      grav:0.06, life:0.9,
      color:r.glowColor, r:rand(3,7),
    });
  }
  water.splash(r.x, -2);
}

function endRun() {
  STATE = 'over';
  const earned = Math.floor(runCoins);
  shop.addMoney(earned);

  document.getElementById('hud').classList.add('hidden');
  document.getElementById('touch-controls').classList.add('hidden');
  document.getElementById('gameover-screen').classList.remove('hidden');

  document.getElementById('go-depth').textContent = runMaxDepth + 'm';
  const totalRes = rCoins.coral+rCoins.gem+rCoins.shell+(rCoins.chest||0);
  document.getElementById('go-resources').textContent = totalRes;
  document.getElementById('go-earnings').textContent = '+' + earned;
  document.getElementById('go-total').textContent = shop.money;
  shop._refreshMoney();
}

// ────────────────────────────────────────────────────────────
//  RENDER
// ────────────────────────────────────────────────────────────
function gameRender(ts) {
  ctx.clearRect(0,0,W,H);
  if (STATE !== 'playing') {
    if (STATE === 'menu') return; // menu-canvas handles it
    renderBackground();
    return;
  }

  const wY = water.baseY - camY; // screen-Y of water surface

  // 1. Sky
  drawSky(wY, ts);

  // 2. Underwater world (behind water)
  drawUnderwater(wY, ts);

  // 3. Water surface + fill
  water.draw(ctx, camX, camY, W, H, ts);

  // 4. Underwater foreground objects
  drawUnderwaterFg(wY, ts);

  // 5. Player trail
  drawTrail();

  // 6. Player
  drawPlayer(ts, wY);

  // 7. Bubbles
  drawBubbles();

  // 8. Particles
  drawParticles();

  // 9. Splashes
  drawSplashes();

  // 10. Boat (above everything)
  boat.draw(ctx, camX, camY);

  // 11. Sonar overlay
  if (ST.sonar && PL.inWater) drawSonar();

  // 12. Dolphins
  drawDolphins();

  // 13. Zone indicator
  if (ST.radar) drawRadar(wY);
}

function renderBackground() {
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#000814');
  g.addColorStop(1,'#001a3a');
  ctx.fillStyle=g;
  ctx.fillRect(0,0,W,H);
}

// ── SKY
function drawSky(wY, ts) {
  if (wY <= 0) return;
  const h = wY + 2;

  // Night sky gradient
  const sg = ctx.createLinearGradient(0,0,0,h);
  sg.addColorStop(0,'#000a1e');
  sg.addColorStop(0.6,'#001640');
  sg.addColorStop(1,'#002a6e');
  ctx.fillStyle=sg;
  ctx.fillRect(0,0,W,h);

  // Stars
  ctx.save();
  for(let i=0;i<80;i++){
    const sx = ((i*137.5+camX*0.03)%W+W)%W;
    const sy = (i*73.1)%(h*0.85);
    const tw = 0.3+0.7*Math.abs(Math.sin(ts*0.0008*i*0.1+i));
    ctx.globalAlpha = tw * 0.85;
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(sx,sy,0.7+(i%3)*0.3,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;

  // Moon
  const mx=W*0.78 - camX*0.02, my=55;
  if (my < h) {
    const mg=ctx.createRadialGradient(mx,my,0,mx,my,50);
    mg.addColorStop(0,'rgba(255,248,210,0.95)');
    mg.addColorStop(0.4,'rgba(255,235,160,0.4)');
    mg.addColorStop(1,'transparent');
    ctx.fillStyle=mg; ctx.fillRect(mx-52,0,104,110);
    ctx.beginPath(); ctx.arc(mx,my,22,0,Math.PI*2);
    ctx.fillStyle='rgba(255,248,210,0.95)'; ctx.fill();
    // moon craters
    ctx.fillStyle='rgba(200,190,160,0.3)';
    [[mx+6,my-5,4],[mx-5,my+6,3],[mx+2,my+12,2]].forEach(([cx2,cy2,r2])=>{
      ctx.beginPath(); ctx.arc(cx2,cy2,r2,0,Math.PI*2); ctx.fill();
    });
    // Moon shimmer path on water
    for(let r=0;r<4;r++){
      ctx.beginPath();
      ctx.moveTo(mx+(r-1.5)*20, h);
      ctx.lineTo(mx+(r-1.5)*20, h);
      ctx.strokeStyle=`rgba(255,240,160,${0.055-r*0.012})`;
      ctx.lineWidth=32-r*6;
      ctx.stroke();
    }
  }

  // Distant horizon glow
  const hg=ctx.createLinearGradient(0,h-30,0,h);
  hg.addColorStop(0,'transparent');
  hg.addColorStop(1,'rgba(0,100,200,0.25)');
  ctx.fillStyle=hg; ctx.fillRect(0,h-30,W,30);
}

// ── UNDERWATER BACKGROUND
function drawUnderwater(wY, ts) {
  // Deep dark bg
  const dg=ctx.createLinearGradient(0,wY,0,H);
  dg.addColorStop(0,'rgba(0,50,110,0)');
  dg.addColorStop(0.15,'rgba(0,30,80,0.97)');
  dg.addColorStop(0.5,'rgba(0,12,40,1)');
  dg.addColorStop(1,'rgba(0,3,15,1)');
  ctx.fillStyle=dg; ctx.fillRect(0,wY,W,H);

  // Caustic light rays near surface
  const playerDepth = PL.y - water.baseY;
  if (playerDepth < 500) {
    ctx.save();
    ctx.globalAlpha = Math.max(0,1-playerDepth/500)*0.07;
    for(let i=0;i<7;i++){
      const rx=((i*200+camX*0.1+ts*0.03)%W+W)%W;
      const ry=wY+i*18;
      const rg=ctx.createLinearGradient(rx,ry,rx,H*0.3+ry);
      rg.addColorStop(0,'rgba(100,200,255,1)');
      rg.addColorStop(1,'transparent');
      ctx.fillStyle=rg;
      ctx.beginPath();
      ctx.moveTo(rx-12,ry); ctx.lineTo(rx+12,ry);
      ctx.lineTo(rx+30,ry+220); ctx.lineTo(rx-30,ry+220);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // Rock outcroppings at depth
  for(let i=0;i<12;i++){
    const rx=((i*380+400)%WORLD_W)-camX;
    if(rx<-100||rx>W+100) continue;
    const ry=water.baseY+600+((i*173)%800)-camY;
    if(ry>H+50||ry<-50) continue;
    drawRock(rx,ry,(i%3)*40+60,i);
  }

  // Seaweeds
  for(const s of seaweeds){
    const sx=s.x-camX, sy=s.y-camY;
    if(sx<-100||sx>W+100||sy<-200||sy>H+100) continue;
    drawSeaweed(sx,sy,s.h,s.segments,s.color,s.sway,ts);
  }

  // Corals
  for(const c of corals){
    const cx2=c.x-camX, cy2=c.y-camY;
    if(cx2<-80||cx2>W+80||cy2<-100||cy2>H+60) continue;
    drawCoral(cx2,cy2,c.size,c.type,c.color,c.color2);
  }

  // Fish
  for(const f of fishes){
    const fx=f.x-camX, fy=f.y-camY;
    if(fx<-40||fx>W+40||fy<-40||fy>H+40) continue;
    drawFish(fx,fy,f.size,f.color,f.vx,f.t);
  }

  // Jellyfish
  for(const j of jellies){
    const jx=j.x-camX, jy=j.y-camY;
    if(jx<-80||jx>W+80||jy<-80||jy>H+80) continue;
    drawJelly(jx,jy,j.size,j.color,j.pulse,j.t);
  }

  // Resources
  for(const r of resources){
    if(r.collected) continue;
    const rx2=r.x-camX, ry2=r.y-camY;
    if(rx2<-50||rx2>W+50||ry2<-50||ry2>H+50) continue;
    drawResource(rx2,ry2,r,ts);
  }

  // Abyss particles
  if(camY>H*0.5){
    ctx.save();
    ctx.fillStyle='rgba(0,120,220,0.12)';
    for(let i=0;i<16;i++){
      const ax=((i*317+globalT*30)%W);
      const ay=((i*113+globalT*18)%H);
      ctx.beginPath(); ctx.arc(ax,ay,rand(1,3),0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawUnderwaterFg(wY, ts) {
  // Foreground bubbles drifting up
  if(Math.random()<0.04 && PL.inWater){
    particles.push({
      x:rand(camX,camX+W), y:water.baseY+rand(100,500),
      vx:rand(-0.2,0.2), vy:-0.6,
      grav:-0.01, life:3, color:'rgba(150,220,255,0.35)', r:rand(2,5),
      _ambient:true,
    });
  }
}

// ── ROCK
function drawRock(x,y,size,seed){
  ctx.save();
  ctx.fillStyle=`hsl(${200+seed*7},15%,${12+seed%8}%)`;
  ctx.beginPath();
  // Bumpy rock silhouette
  const pts=8;
  for(let i=0;i<pts;i++){
    const a=i/pts*Math.PI*2-Math.PI*0.5;
    const r2=size*(0.6+((seed*13+i*7)%10)*0.04);
    const px2=x+Math.cos(a)*r2, py2=y+Math.sin(a)*r2*0.5;
    i===0?ctx.moveTo(px2,py2):ctx.lineTo(px2,py2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle=`rgba(255,255,255,0.04)`;
  ctx.fill();
  ctx.restore();
}

// ── SEAWEED
function drawSeaweed(x,y,h,segs,color,sway,ts){
  ctx.save();
  ctx.strokeStyle=color;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  const sw=ts*0.8+sway;
  // Draw two slightly offset strands for thickness
  for(let strand=0;strand<2;strand++){
    ctx.lineWidth = strand===0?5:3;
    ctx.strokeStyle= strand===0?color:lightenColor(color,30);
    ctx.globalAlpha= strand===0?1:0.6;
    ctx.beginPath();
    let cx2=x+strand*4, cy2=y;
    ctx.moveTo(cx2,cy2);
    for(let i=1;i<=segs;i++){
      const t2=i/segs;
      const bend=Math.sin(sw+i*0.7)*14*t2;
      const nx=cx2+bend, ny=cy2-h/segs;
      ctx.quadraticCurveTo(cx2+bend*1.4, cy2-h/segs*0.5, nx, ny);
      cx2=nx; cy2=ny;
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ── CORAL
function drawCoral(x,y,size,type,col,col2){
  ctx.save();
  ctx.shadowColor=col;
  ctx.shadowBlur=10;
  switch(type){
    case 0:{ // Brain coral
      ctx.beginPath(); ctx.arc(x,y,size*0.5,0,Math.PI*2);
      ctx.fillStyle=col; ctx.fill();
      ctx.strokeStyle=col2; ctx.lineWidth=1.5;
      for(let i=0;i<5;i++){
        ctx.beginPath();
        ctx.arc(x,y,size*(0.1+i*0.08),0,Math.PI*2);
        ctx.stroke();
      }
      break;
    }
    case 1:{ // Branch coral
      ctx.strokeStyle=col; ctx.lineWidth=4; ctx.lineCap='round';
      const drawBranch=(bx,by,len,angle,depth)=>{
        if(depth>3||len<6) return;
        const ex=bx+Math.cos(angle)*len, ey=by+Math.sin(angle)*len;
        ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(ex,ey); ctx.stroke();
        ctx.lineWidth=Math.max(1,4-depth);
        drawBranch(ex,ey,len*0.65,angle-0.4,depth+1);
        drawBranch(ex,ey,len*0.65,angle+0.4,depth+1);
        if(depth<2) drawBranch(ex,ey,len*0.5,angle,depth+1);
        if(depth===3){
          ctx.beginPath(); ctx.arc(ex,ey,3,0,Math.PI*2);
          ctx.fillStyle=col2; ctx.fill();
        }
      };
      drawBranch(x,y,size*0.6,-Math.PI*0.5,0);
      break;
    }
    case 2:{ // Fan coral
      for(let i=0;i<9;i++){
        const a=-Math.PI*0.85+i/8*Math.PI*1.7;
        ctx.beginPath();
        ctx.moveTo(x,y);
        ctx.bezierCurveTo(
          x+Math.cos(a)*size*0.5, y+Math.sin(a)*size*0.4,
          x+Math.cos(a)*size*0.8, y+Math.sin(a)*size*0.7,
          x+Math.cos(a)*size,     y+Math.sin(a)*size*0.8
        );
        ctx.strokeStyle=i%2===0?col:col2;
        ctx.lineWidth=2; ctx.stroke();
      }
      // Mesh between
      ctx.fillStyle=col+'22';
      ctx.beginPath();
      ctx.arc(x,y,size,Math.PI*1.15,0); ctx.fill();
      break;
    }
    case 3:{ // Tube coral
      for(let i=-2;i<=2;i++){
        const tx2=x+i*size*0.22;
        const th=size*(0.7+Math.abs(i)*0.15);
        ctx.fillStyle=i%2===0?col:col2;
        ctx.beginPath(); ctx.roundRect(tx2-size*0.08,y-th,size*0.16,th,4); ctx.fill();
        // Opening
        ctx.beginPath(); ctx.ellipse(tx2,y-th,size*0.1,size*0.06,0,0,Math.PI*2);
        ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fill();
      }
      break;
    }
    case 4:{ // Anemone
      for(let i=0;i<12;i++){
        const a=i/12*Math.PI*2;
        const r2=size*0.55;
        ctx.beginPath();
        ctx.moveTo(x,y);
        ctx.quadraticCurveTo(
          x+Math.cos(a+0.3)*r2*0.7, y+Math.sin(a+0.3)*r2*0.7,
          x+Math.cos(a)*r2, y+Math.sin(a)*r2
        );
        ctx.strokeStyle=i%3===0?col:col2;
        ctx.lineWidth=3; ctx.stroke();
        ctx.beginPath(); ctx.arc(x+Math.cos(a)*r2,y+Math.sin(a)*r2,4,0,Math.PI*2);
        ctx.fillStyle=col2; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x,y,size*0.2,0,Math.PI*2);
      ctx.fillStyle=col; ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ── FISH
function drawFish(x,y,size,color,vx,t){
  ctx.save();
  ctx.translate(x,y);
  if(vx<0) ctx.scale(-1,1);

  const tailWag=Math.sin(t*4)*0.18;

  // Shadow
  ctx.save(); ctx.translate(3,4); ctx.globalAlpha=0.2;
  ctx.beginPath(); ctx.ellipse(0,0,size,size*0.45,0,0,Math.PI*2);
  ctx.fillStyle='#000'; ctx.fill();
  ctx.restore();

  // Tail
  ctx.save(); ctx.rotate(tailWag);
  ctx.beginPath();
  ctx.moveTo(-size,0);
  ctx.lineTo(-size*1.7,-size*0.55);
  ctx.lineTo(-size*1.7,size*0.55);
  ctx.closePath();
  ctx.fillStyle=color; ctx.fill();
  ctx.restore();

  // Body
  const bg=ctx.createRadialGradient(size*0.2,-size*0.1,0,0,0,size*1.1);
  bg.addColorStop(0,lightenColor(color,50));
  bg.addColorStop(1,color);
  ctx.beginPath(); ctx.ellipse(0,0,size,size*0.45,0,0,Math.PI*2);
  ctx.fillStyle=bg; ctx.fill();

  // Belly
  ctx.beginPath(); ctx.ellipse(size*0.1,size*0.1,size*0.55,size*0.22,0.2,0,Math.PI*2);
  ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.fill();

  // Dorsal fin
  ctx.beginPath();
  ctx.moveTo(-size*0.1,-size*0.45);
  ctx.quadraticCurveTo(size*0.2,-size*1.0,size*0.4,-size*0.45);
  ctx.fillStyle=color; ctx.fill();

  // Eye
  ctx.beginPath(); ctx.arc(size*0.5,-size*0.1,size*0.17,0,Math.PI*2);
  ctx.fillStyle='#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(size*0.52,-size*0.1,size*0.1,0,Math.PI*2);
  ctx.fillStyle='#1a1a2e'; ctx.fill();
  ctx.beginPath(); ctx.arc(size*0.55,-size*0.14,size*0.04,0,Math.PI*2);
  ctx.fillStyle='#fff'; ctx.fill();

  // Scales
  ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=0.8;
  for(let i=0;i<3;i++){
    ctx.beginPath(); ctx.arc(i*size*0.25-size*0.1,0,size*0.2,0,Math.PI); ctx.stroke();
  }

  ctx.restore();
}

// ── JELLYFISH
function drawJelly(x,y,size,color,pulse,t){
  ctx.save(); ctx.translate(x,y);
  const ps=1+Math.sin(pulse)*0.18;

  // Outer glow
  const gg=ctx.createRadialGradient(0,-size*0.3,0,0,0,size*1.4*ps);
  gg.addColorStop(0,color.replace('0.8','0.25').replace('0.85','0.25'));
  gg.addColorStop(1,'transparent');
  ctx.fillStyle=gg; ctx.fillRect(-size*1.5,-size*1.5,size*3,size*3);

  // Bell top
  ctx.beginPath();
  ctx.moveTo(-size*ps,0);
  ctx.bezierCurveTo(-size*ps,-size*ps*0.9,  size*ps,-size*ps*0.9, size*ps,0);
  ctx.closePath();
  ctx.fillStyle=color; ctx.fill();

  // Inner highlight
  const ih=ctx.createRadialGradient(-size*0.25*ps,-size*0.45*ps,0,0,-size*0.3*ps,size*0.7*ps);
  ih.addColorStop(0,'rgba(255,255,255,0.35)'); ih.addColorStop(1,'transparent');
  ctx.fillStyle=ih; ctx.fill();

  // Rim
  ctx.beginPath();
  ctx.moveTo(-size*ps,0);
  for(let i=0;i<=10;i++){
    const rx=(-size*ps)+i*(size*ps*2/10);
    const ry=Math.sin(i/10*Math.PI)*-size*0.12*ps+Math.sin(t*3+i)*size*0.06;
    ctx.lineTo(rx,ry);
  }
  ctx.strokeStyle=color.replace('0.8','0.7').replace('0.85','0.7');
  ctx.lineWidth=2; ctx.stroke();

  // Tentacles
  for(let i=0;i<8;i++){
    const tx2=(-size*ps*0.85)+(i/7)*size*ps*1.7;
    ctx.beginPath(); ctx.moveTo(tx2,0);
    for(let s=1;s<=8;s++){
      const sy2=s*size*0.55;
      const sx2=tx2+Math.sin(t*1.5+pulse*0.5+s*0.7+i*0.9)*size*0.22;
      ctx.lineTo(sx2,sy2);
    }
    ctx.strokeStyle=color.replace('0.8','0.45').replace('0.85','0.45');
    ctx.lineWidth=1.5; ctx.stroke();
  }
  ctx.restore();
}

// ── RESOURCE
function drawResource(x,y,r,ts){
  const pulse=Math.sin(r.gT + ts*1.8)*0.5+0.5;
  ctx.save(); ctx.translate(x,y);

  // Outer glow ring
  const gg=ctx.createRadialGradient(0,0,4,0,0,28+pulse*8);
  gg.addColorStop(0,r.glowColor+'55');
  gg.addColorStop(1,'transparent');
  ctx.fillStyle=gg; ctx.fillRect(-36,-36,72,72);

  // Pulsing ring
  ctx.beginPath(); ctx.arc(0,0,16+pulse*5,0,Math.PI*2);
  ctx.strokeStyle=r.glowColor+'44'; ctx.lineWidth=3; ctx.stroke();

  // Icon
  ctx.font=`${22+pulse*3}px serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  if(r.type==='coral')  ctx.fillText('🪸',0,0);
  else if(r.type==='gem')   ctx.fillText('💎',0,0);
  else if(r.type==='shell') ctx.fillText('🐚',0,0);
  else { // chest
    drawChest(ctx, 0, 0, 22+pulse*3, ts);
  }
  ctx.restore();
}

function drawChest(ctx, x, y, size, ts){
  const s = size*0.8;
  ctx.save(); ctx.translate(x,y);
  // Body
  ctx.fillStyle='#6a3a12';
  ctx.fillRect(-s,-s*0.45,s*2,s);
  // Lid
  ctx.fillStyle='#8a4e1e';
  ctx.fillRect(-s,-s,s*2,s*0.6);
  ctx.beginPath(); ctx.arc(0,-s*0.7,s,Math.PI,0); ctx.fillStyle='#9a5e28'; ctx.fill();
  // Bands
  ctx.strokeStyle='#c8901e'; ctx.lineWidth=s*0.12;
  ctx.strokeRect(-s,-s,s*2,s*1.5);
  ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(0,s*0.55); ctx.stroke();
  // Lock
  ctx.beginPath(); ctx.arc(0,-s*0.1,s*0.22,0,Math.PI*2);
  ctx.fillStyle='#e8b030'; ctx.fill();
  // Shine
  ctx.globalAlpha=0.7+Math.sin(ts*2)*0.3;
  ctx.fillStyle='rgba(255,220,80,0.6)';
  ctx.font=`${s}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('✨',0,-s*1.4);
  ctx.restore();
}

// ── PLAYER
function drawPlayer(ts, wY){
  const sx=PL.x-camX, sy=PL.y-camY;
  ctx.save(); ctx.translate(sx,sy);

  if(PL.inWater || !PL.onBoat){
    ctx.rotate(PL.angle);
    drawDiver(ctx, PL.armT, PL.inWater, ts);
  } else {
    // On boat — standing
    drawDiverStanding(ctx, ts);
  }
  ctx.restore();
}

function drawDiver(ctx, armT, inWater, ts){
  const kick=Math.sin(armT)*0.3;

  // ── Fins
  ctx.save();
  ctx.fillStyle='#e88020';
  // Left fin
  ctx.save(); ctx.rotate(-kick*0.5);
  ctx.beginPath(); ctx.ellipse(-10,26,16,7,-0.3,0,Math.PI*2);
  ctx.fill(); ctx.restore();
  // Right fin
  ctx.save(); ctx.rotate(kick*0.5);
  ctx.beginPath(); ctx.ellipse(10,26,16,7,0.3,0,Math.PI*2);
  ctx.fill(); ctx.restore();
  ctx.restore();

  // ── Body suit
  const sg=ctx.createLinearGradient(-14,-18,14,22);
  sg.addColorStop(0,'#1a6ac8');
  sg.addColorStop(0.5,'#1454a0');
  sg.addColorStop(1,'#0c3870');
  ctx.beginPath(); ctx.roundRect(-14,-18,28,42,7);
  ctx.fillStyle=sg; ctx.fill();

  // Suit highlights
  ctx.strokeStyle='rgba(100,180,255,0.25)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(-8,-15); ctx.lineTo(-8,20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(8,-15);  ctx.lineTo(8,20);  ctx.stroke();

  // Chest piece / stripes
  ctx.fillStyle='rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.roundRect(-10,-5,20,14,3); ctx.fill();

  // Oxygen tank
  ctx.beginPath(); ctx.roundRect(10,-14,9,22,3);
  const tg=ctx.createLinearGradient(10,-14,19,-14+22);
  tg.addColorStop(0,'#888'); tg.addColorStop(1,'#444');
  ctx.fillStyle=tg; ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.roundRect(10,-14,4,22,3); ctx.fill();

  // Arms (animated)
  ctx.save();
  ctx.fillStyle='#1a6ac8';
  ctx.save(); ctx.translate(-14,2); ctx.rotate(-kick*0.5);
  ctx.beginPath(); ctx.ellipse(0,0,7,4,0.5,0,Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(14,2); ctx.rotate(kick*0.5);
  ctx.beginPath(); ctx.ellipse(0,0,7,4,-0.5,0,Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.restore();

  // ── Helmet
  ctx.beginPath(); ctx.arc(0,-20,15,0,Math.PI*2);
  ctx.fillStyle='#222'; ctx.fill();
  // Helmet ring
  ctx.beginPath(); ctx.arc(0,-20,15,0,Math.PI*2);
  ctx.strokeStyle='rgba(100,180,255,0.3)'; ctx.lineWidth=2; ctx.stroke();

  // Visor
  ctx.beginPath(); ctx.arc(0,-20,11,-Math.PI*0.72,Math.PI*0.72);
  const vg=ctx.createRadialGradient(-3,-24,1,0,-20,11);
  vg.addColorStop(0,'rgba(160,240,255,0.92)');
  vg.addColorStop(0.5,'rgba(60,160,230,0.8)');
  vg.addColorStop(1,'rgba(20,80,180,0.7)');
  ctx.fillStyle=vg; ctx.fill();
  // Visor shine
  ctx.fillStyle='rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(-4,-24,3.5,2,0.5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(1,-21,1.5,1,0,0,Math.PI*2); ctx.fill();

  // Air hose
  ctx.beginPath();
  ctx.moveTo(10,-18); ctx.quadraticCurveTo(16,-24,12,-28);
  ctx.strokeStyle='rgba(150,150,180,0.6)'; ctx.lineWidth=2; ctx.stroke();

  // Light (if upgrade)
  if(ST.light){
    const lightAngle=0;
    ctx.save();
    ctx.translate(-12,-20); ctx.rotate(lightAngle);
    // Cone
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.lineTo(-30,-15); ctx.lineTo(-30,15); ctx.closePath();
    ctx.fillStyle='rgba(255,240,150,0.12)'; ctx.fill();
    // Bulb
    ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2);
    ctx.fillStyle='rgba(255,240,150,0.9)'; ctx.fill();
    ctx.restore();
  }
}

function drawDiverStanding(ctx, ts){
  // Simpler standing pose
  ctx.fillStyle='#1a6ac8';
  ctx.beginPath(); ctx.roundRect(-12,-28,24,40,6); ctx.fill();
  ctx.beginPath(); ctx.arc(0,-30,13,0,Math.PI*2);
  ctx.fillStyle='#222'; ctx.fill();
  ctx.beginPath(); ctx.arc(0,-30,9.5,-Math.PI*0.65,Math.PI*0.65);
  ctx.fillStyle='rgba(120,220,255,0.88)'; ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.ellipse(-3,-34,3,2,0.4,0,Math.PI*2); ctx.fill();
}

// ── TRAIL
function drawTrail(){
  for(let i=0;i<PL.trail.length;i++){
    const t=PL.trail[i];
    const alpha=t.life*0.4;
    ctx.beginPath();
    ctx.arc(t.x-camX,t.y-camY,3,0,Math.PI*2);
    ctx.fillStyle=`rgba(80,180,255,${alpha})`;
    ctx.fill();
  }
}

// ── BUBBLES
function drawBubbles(){
  ctx.save();
  for(const b of PL.bubbles){
    const a=b.life*0.55;
    ctx.beginPath(); ctx.arc(b.x-camX,b.y-camY,b.r,0,Math.PI*2);
    ctx.strokeStyle=`rgba(160,230,255,${a})`; ctx.lineWidth=1.2; ctx.stroke();
    ctx.fillStyle=`rgba(220,245,255,${a*0.25})`; ctx.fill();
    // shine
    ctx.beginPath(); ctx.arc(b.x-camX-b.r*0.3,b.y-camY-b.r*0.3,b.r*0.2,0,Math.PI*2);
    ctx.fillStyle=`rgba(255,255,255,${a*0.5})`; ctx.fill();
  }
  ctx.restore();
}

// ── PARTICLES
function drawParticles(){
  ctx.save();
  for(const p of particles){
    if(p._ambient){
      // Ambient bubble
      ctx.beginPath(); ctx.arc(p.x-camX,p.y-camY,p.r,0,Math.PI*2);
      ctx.strokeStyle=`rgba(150,220,255,${p.life*0.3})`; ctx.lineWidth=1; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(p.x-camX,p.y-camY,p.r||4,0,Math.PI*2);
      ctx.fillStyle=p.color||'#fff';
      ctx.globalAlpha=Math.min(1,p.life);
      ctx.fill();
    }
  }
  ctx.globalAlpha=1;
  ctx.restore();
}

// ── SPLASHES
function drawSplashes(){
  ctx.save();
  for(const s of splashes){
    ctx.beginPath(); ctx.arc(s.x-camX,s.y-camY,s.r||3,0,Math.PI*2);
    ctx.fillStyle=`rgba(200,240,255,${s.life*0.7})`;
    ctx.fill();
  }
  ctx.restore();
}

// ── SONAR
function drawSonar(){
  ctx.save();
  const px=PL.x-camX, py=PL.y-camY;
  const range=220;
  for(const r of resources){
    if(r.collected) continue;
    const rx2=r.x-camX, ry2=r.y-camY;
    const d=Math.hypot(rx2-px,ry2-py);
    if(d<range){
      const alpha=(1-d/range)*0.6;
      ctx.beginPath(); ctx.arc(rx2,ry2,7,0,Math.PI*2);
      ctx.fillStyle=`rgba(0,255,140,${alpha})`; ctx.fill();
      ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(rx2,ry2);
      ctx.strokeStyle=`rgba(0,255,140,${alpha*0.2})`;
      ctx.lineWidth=1; ctx.stroke();
    }
  }
  ctx.restore();
}

// ── DOLPHINS
function drawDolphins(){
  for(const d of dolphins){
    const dx=d.x-camX, dy=d.y-camY;
    if(dx<-80||dx>W+80) continue;
    ctx.save(); ctx.translate(dx,dy);
    const ang=Math.atan2(d.vy,d.vx);
    ctx.rotate(ang);

    // Body
    const dg=ctx.createRadialGradient(8,0,0,0,0,30);
    dg.addColorStop(0,'#7acce0');
    dg.addColorStop(1,'#4a98b0');
    ctx.beginPath(); ctx.ellipse(0,0,30,12,0,0,Math.PI*2);
    ctx.fillStyle=dg; ctx.fill();
    // Belly
    ctx.beginPath(); ctx.ellipse(6,4,20,7,0.1,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.fill();
    // Dorsal fin
    ctx.beginPath(); ctx.moveTo(-5,-12); ctx.lineTo(8,-30); ctx.lineTo(18,-12);
    ctx.fillStyle='#4a98b0'; ctx.fill();
    // Tail
    ctx.beginPath();
    ctx.moveTo(-30,0); ctx.lineTo(-44,-12); ctx.lineTo(-44,12);
    ctx.fillStyle='#4a98b0'; ctx.fill();
    // Eye
    ctx.beginPath(); ctx.arc(22,-3,3.5,0,Math.PI*2);
    ctx.fillStyle='#1a1a2e'; ctx.fill();
    ctx.beginPath(); ctx.arc(23,-4,1.2,0,Math.PI*2);
    ctx.fillStyle='#fff'; ctx.fill();
    // Smile
    ctx.beginPath(); ctx.arc(24,1,5,0.1,Math.PI*0.5);
    ctx.strokeStyle='#2a6880'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.restore();
  }
}

// ── RADAR (depth zones)
function drawRadar(wY){
  if(!ST.radar) return;
  const zones=[
    {depth:0,   label:'SURFACE',  color:'rgba(100,200,255,0.12)'},
    {depth:200, label:'SHALLOW',  color:'rgba(0,140,220,0.12)'},
    {depth:500, label:'MID',      color:'rgba(0,80,160,0.12)'},
    {depth:1000,label:'DEEP',     color:'rgba(0,40,120,0.12)'},
    {depth:2000,label:'ABYSS',    color:'rgba(0,10,60,0.12)'},
  ];
  const depth=PL.inWater?Math.floor(PL.y-water.baseY):0;
  ctx.save();
  // Current zone label top-right area
  let curZone='SURFACE';
  for(const z of zones){ if(depth>=z.depth) curZone=z.label; }
  ctx.fillStyle='rgba(0,200,255,0.6)';
  ctx.font='bold 11px "Orbitron",monospace';
  ctx.textAlign='right'; ctx.textBaseline='middle';
  ctx.fillText('ZONE: '+curZone, W-16, 80);
  ctx.restore();
}

// ────────────────────────────────────────────────────────────
//  HUD UPDATE
// ────────────────────────────────────────────────────────────
function updateHUD(){
  const pct=Math.max(0,(PL.air/PL.maxAir)*100);
  const bar=document.getElementById('air-bar');
  bar.style.width=pct+'%';
  if(pct<20){
    bar.style.background='linear-gradient(90deg,#ff2020,#ff6060)';
    bar.style.boxShadow='0 0 12px #ff2020';
    if(pct<10) bar.style.animation='airPulse 0.4s ease-in-out infinite';
  } else if(pct<40){
    bar.style.background='linear-gradient(90deg,#ff8800,#ffcc44)';
    bar.style.boxShadow='0 0 10px #ff8800';
    bar.style.animation='';
  } else {
    bar.style.background='linear-gradient(90deg,#00d4ff,#80f0ff)';
    bar.style.boxShadow='0 0 10px #00bfff';
    bar.style.animation='';
  }
  const depth=Math.max(0,Math.floor(PL.y-water.baseY));
  document.getElementById('depth-val').textContent=depth+'m';
  document.getElementById('res-coral').textContent=rCoins.coral;
  document.getElementById('res-gem').textContent=rCoins.gem;
  document.getElementById('res-shell').textContent=rCoins.shell;
  document.getElementById('money-display').textContent=shop.money;
}

// ────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────
function spawnSplash(wx,wy,count){
  for(let i=0;i<count;i++){
    splashes.push({
      x:wx+rand(-20,20), y:wy+rand(-5,5),
      vx:rand(-3,3), vy:rand(-5,-1),
      r:rand(2,5), life:rand(0.4,0.8),
    });
  }
}

function lightenColor(hex,amt){
  // Simple hex lightener
  if(!hex.startsWith('#')) return hex;
  let r=parseInt(hex.slice(1,3),16);
  let g=parseInt(hex.slice(3,5),16);
  let b=parseInt(hex.slice(5,7),16);
  r=Math.min(255,r+amt); g=Math.min(255,g+amt); b=Math.min(255,b+amt);
  return '#'+(r<16?'0':'')+r.toString(16)+(g<16?'0':'')+g.toString(16)+(b<16?'0':'')+b.toString(16);
}

function rand(a,b){ return a+Math.random()*(b-a); }
function randPick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function lerp(a,b,t){ return a+(b-a)*t; }
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }

// ────────────────────────────────────────────────────────────
//  INPUT
// ────────────────────────────────────────────────────────────
function bindInput(){
  window.addEventListener('keydown',e=>{
    keys[e.key]=true;
    if((e.key===' '||e.key==='Enter') && STATE==='playing') doDive();
  });
  window.addEventListener('keyup',e=>{ keys[e.key]=false; });

  // D-pad touch + mouse
  const dirs={
    'btn-up':'up','btn-down':'down','btn-left':'left','btn-right':'right'
  };
  for(const [id,dir] of Object.entries(dirs)){
    const btn=document.getElementById(id);
    if(!btn) continue;
    const on =e=>{ e.preventDefault(); touch[dir]=true;  btn.classList.add('held'); };
    const off=e=>{ e.preventDefault(); touch[dir]=false; btn.classList.remove('held'); };
    btn.addEventListener('touchstart',on,{passive:false});
    btn.addEventListener('touchend',off,{passive:false});
    btn.addEventListener('touchcancel',off,{passive:false});
    btn.addEventListener('mousedown',()=>{ touch[dir]=true;  btn.classList.add('held'); });
    btn.addEventListener('mouseup',  ()=>{ touch[dir]=false; btn.classList.remove('held'); });
    btn.addEventListener('mouseleave',()=>{ touch[dir]=false; btn.classList.remove('held'); });
  }

  const jumpBtn=document.getElementById('btn-jump');
  if(jumpBtn){
    jumpBtn.addEventListener('touchstart',e=>{ e.preventDefault(); doDive(); },{passive:false});
    jumpBtn.addEventListener('mousedown',doDive);
  }
}

function doDive(){
  if(STATE!=='playing') return;
  if(PL.onBoat){
    // Jump off boat into water
    PL.onBoat=false;
    PL.inWater=false;
    PL.x = boat.x;
    PL.y = boat.y - 40;
    PL.vx = 0;
    PL.vy = 3;  // downward velocity
    water.splash(PL.x, 12);
  } else if(!PL.inWater){
    // Standing on surface → dive under
    PL.inWater=true;
    PL.vy=4;
  } else {
    // Underwater → kick upward toward surface
    PL.vy = -7;
  }
}

// ────────────────────────────────────────────────────────────
//  UI BINDINGS
// ────────────────────────────────────────────────────────────
function bindUI(){
  document.getElementById('btn-play').addEventListener('click', startGame);
  document.getElementById('btn-replay').addEventListener('click', startGame);
  document.getElementById('btn-tut-ok').addEventListener('click', ()=>{
    document.getElementById('tut-overlay').classList.add('hidden');
  });
  document.getElementById('btn-go-menu').addEventListener('click', ()=>{
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
    STATE='menu';
    shop._refreshMoney();
    initMenuCanvas();
  });
  document.getElementById('btn-go-shop').addEventListener('click', ()=>{
    document.getElementById('gameover-screen').classList.add('hidden');
    shop.open();
  });
}

// ────────────────────────────────────────────────────────────
//  BOOT
// ────────────────────────────────────────────────────────────
window.addEventListener('resize',()=>{ resize(); if(menuWater){ const mc=document.getElementById('menu-canvas'); if(mc){mc.width=W;mc.height=H;menuWater.setWidth(mc.width);menuWater.baseY=mc.height*0.55;}} });
window.addEventListener('orientationchange',()=>setTimeout(()=>{ resize(); },300));
window.addEventListener('load', init);
