// physics.js — Water surface spring simulation & Boat physics

class WaterPhysics {
  constructor(width, numPts) {
    this.numPoints = numPts || 140;
    this.setWidth(width);
    this.points    = new Float32Array(this.numPoints);
    this.velocities= new Float32Array(this.numPoints);
    this.baseY = 0;
    this.tension = 0.022;
    this.damping  = 0.988;
    this.spread   = 0.18;
  }

  setWidth(w) {
    this.width = w;
    this.spacing = w / (this.numPoints - 1);
  }

  splash(worldX, force) {
    const i = Math.round(worldX / this.spacing);
    if (i >= 0 && i < this.numPoints) {
      this.velocities[i] += force;
      if (i>0)  this.velocities[i-1] += force*0.5;
      if (i<this.numPoints-1) this.velocities[i+1] += force*0.5;
      if (i>1)  this.velocities[i-2] += force*0.25;
      if (i<this.numPoints-2) this.velocities[i+2] += force*0.25;
    }
  }

  update() {
    const n = this.numPoints;
    // Spring + propagation
    for (let i = 0; i < n; i++) {
      this.velocities[i] += -this.tension * this.points[i];
      this.velocities[i] *= this.damping;
    }
    // Two-pass wave propagation
    const lD = new Float32Array(n);
    const rD = new Float32Array(n);
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 0; i < n; i++) {
        if (i > 0) {
          lD[i] = this.spread * (this.points[i] - this.points[i-1]);
          this.velocities[i-1] += lD[i];
        }
        if (i < n-1) {
          rD[i] = this.spread * (this.points[i] - this.points[i+1]);
          this.velocities[i+1] += rD[i];
        }
      }
      for (let i = 0; i < n; i++) {
        if (i > 0)   this.points[i-1] += lD[i];
        if (i < n-1) this.points[i+1] += rD[i];
      }
    }
    for (let i = 0; i < n; i++) this.points[i] += this.velocities[i];
  }

  // Get world-Y of water surface at world-X
  getY(worldX) {
    const raw = worldX / this.spacing;
    const i = Math.floor(raw);
    const t = raw - i;
    const ia = Math.max(0, Math.min(i,   this.numPoints-1));
    const ib = Math.max(0, Math.min(i+1, this.numPoints-1));
    return this.baseY + this.points[ia] * (1-t) + this.points[ib] * t;
  }

  draw(ctx, camX, camY, W, H, ts) {
    // Build screen-space surface points
    // Only draw points that are on screen + 2 extra each side
    const iStart = Math.max(0, Math.floor(camX / this.spacing) - 2);
    const iEnd   = Math.min(this.numPoints-1, Math.ceil((camX + W) / this.spacing) + 2);

    const pts = [];
    for (let i = iStart; i <= iEnd; i++) {
      pts.push({
        sx: i * this.spacing - camX,
        sy: this.baseY + this.points[i] - camY
      });
    }
    if (pts.length < 2) return;

    // ── Deep water fill
    const grad = ctx.createLinearGradient(0, pts[0].sy, 0, H);
    grad.addColorStop(0,   'rgba(0,100,180,0.82)');
    grad.addColorStop(0.12,'rgba(0,60,140,0.95)');
    grad.addColorStop(0.45,'rgba(0,25,80,1)');
    grad.addColorStop(1,   'rgba(0,5,20,1)');

    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length-1; i++) {
      const mx = (pts[i].sx + pts[i+1].sx) * 0.5;
      const my = (pts[i].sy + pts[i+1].sy) * 0.5;
      ctx.quadraticCurveTo(pts[i].sx, pts[i].sy, mx, my);
    }
    const last = pts[pts.length-1];
    ctx.lineTo(last.sx, last.sy);
    ctx.lineTo(last.sx, H+10);
    ctx.lineTo(pts[0].sx, H+10);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // ── Highlight shimmer line
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length-1; i++) {
      const mx = (pts[i].sx + pts[i+1].sx) * 0.5;
      const my = (pts[i].sy + pts[i+1].sy) * 0.5;
      ctx.quadraticCurveTo(pts[i].sx, pts[i].sy, mx, my);
    }
    ctx.lineTo(last.sx, last.sy);
    const shimGrad = ctx.createLinearGradient(0,0,W,0);
    shimGrad.addColorStop(0,'rgba(100,220,255,0.0)');
    shimGrad.addColorStop(0.3,'rgba(150,230,255,0.85)');
    shimGrad.addColorStop(0.7,'rgba(100,220,255,0.85)');
    shimGrad.addColorStop(1,'rgba(100,220,255,0.0)');
    ctx.strokeStyle = shimGrad;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // ── Foam where velocity is high
    ctx.fillStyle = 'rgba(220,240,255,0.55)';
    for (let i = iStart; i <= iEnd; i++) {
      if (Math.abs(this.velocities[i]) > 0.8) {
        const sx = i * this.spacing - camX;
        const sy = this.baseY + this.points[i] - camY;
        const r = Math.min(4, Math.abs(this.velocities[i]) * 1.2);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }
}

// ────────────────────────────────────────
class BoatPhysics {
  constructor(worldX) {
    this.x = worldX;
    this.y = 0;
    this.angle = 0;
    this.width = 130;
    this.smokeT = 0;
    this.smokeParticles = [];
    this.waveT = 0;
  }

  update(dt, water) {
    this.waveT += dt;
    // Sample water at three hull points
    const wL = water.getY(this.x - 44);
    const wC = water.getY(this.x);
    const wR = water.getY(this.x + 44);
    const wAvg = (wL + wC*2 + wR) / 4;

    // Gently bob to water surface
    const targetY = wAvg - 28;
    this.y += (targetY - this.y) * 0.22;

    // Tilt from slope
    const targetAngle = Math.atan2(wR - wL, 88) * 0.65;
    this.angle += (targetAngle - this.angle) * 0.14;

    // Gentle horizontal drift
    this.x += Math.sin(this.waveT * 0.35) * 0.25;

    // Smoke
    this.smokeT += dt;
    if (this.smokeT > 0.15) {
      this.smokeT = 0;
      this.smokeParticles.push({
        x: this.x - 30, y: this.y - 60,
        vx: -0.3 + Math.random()*0.6,
        vy: -0.8 - Math.random()*0.6,
        life: 1, r: 4 + Math.random()*4,
        angle: this.angle
      });
    }
    this.smokeParticles.forEach(s => {
      s.x += s.vx; s.y += s.vy;
      s.r += 0.15; s.life -= dt * 0.8;
    });
    this.smokeParticles = this.smokeParticles.filter(s => s.life > 0);
  }

  draw(ctx, camX, camY) {
    const sx = this.x - camX;
    const sy = this.y - camY;

    // Smoke
    for (const s of this.smokeParticles) {
      const alpha = s.life * 0.25;
      ctx.beginPath();
      ctx.arc(s.x - camX, s.y - camY, s.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(180,190,200,${alpha})`;
      ctx.fill();
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);

    // ── Hull shadow
    ctx.save();
    ctx.translate(4, 10);
    ctx.beginPath();
    ctx.ellipse(0, 0, 66, 16, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
    ctx.restore();

    // ── Hull body (dark hull below waterline)
    ctx.beginPath();
    ctx.moveTo(-66, 4);
    ctx.bezierCurveTo(-66, 20, -40, 28, 0, 28);
    ctx.bezierCurveTo(40, 28, 68, 20, 70, 6);
    ctx.bezierCurveTo(70, -4, 50, -8, 0, -8);
    ctx.bezierCurveTo(-50, -8, -66, -4, -66, 4);
    ctx.fillStyle = '#1a3a5c';
    ctx.fill();

    // ── Hull above deck (lighter)
    const hullG = ctx.createLinearGradient(0,-28,0,4);
    hullG.addColorStop(0,'#d4a53f');
    hullG.addColorStop(0.6,'#b8872a');
    hullG.addColorStop(1,'#8a5e1a');
    ctx.beginPath();
    ctx.moveTo(-66, 4);
    ctx.bezierCurveTo(-66, -8, -44, -24, -10, -28);
    ctx.bezierCurveTo(10, -30, 50, -22, 70, 6);
    ctx.bezierCurveTo(70, -4, 50, -8, 0, -8);
    ctx.bezierCurveTo(-50, -8, -66, -4, -66, 4);
    ctx.fillStyle = hullG;
    ctx.fill();

    // Hull stripe
    ctx.beginPath();
    ctx.moveTo(-64, 0);
    ctx.bezierCurveTo(-40, -3, 30, -3, 68, 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // ── Deck
    ctx.beginPath();
    ctx.ellipse(0, -28, 60, 10, 0, Math.PI, 0);
    ctx.fillStyle = '#c8a838';
    ctx.fill();

    // ── Cabin
    const cabG = ctx.createLinearGradient(0,-70,0,-28);
    cabG.addColorStop(0,'#f0ece0');
    cabG.addColorStop(1,'#d4cdb8');
    ctx.beginPath();
    ctx.roundRect(-22,-72,44,44,8);
    ctx.fillStyle = cabG;
    ctx.fill();
    ctx.strokeStyle = '#a09880';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Cabin window
    const winG = ctx.createLinearGradient(-12,-66,12,-50);
    winG.addColorStop(0,'rgba(180,230,255,0.9)');
    winG.addColorStop(1,'rgba(80,160,220,0.7)');
    ctx.beginPath();
    ctx.roundRect(-14,-66,28,18,4);
    ctx.fillStyle = winG;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Window reflection
    ctx.beginPath();
    ctx.moveTo(-12,-64);
    ctx.lineTo(-6,-50);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cabin roof
    ctx.beginPath();
    ctx.roundRect(-24,-76,48,8,4);
    ctx.fillStyle = '#e05030';
    ctx.fill();

    // ── Mast
    ctx.beginPath();
    ctx.moveTo(-4,-72);
    ctx.lineTo(-4,-130);
    ctx.strokeStyle = '#9a7030';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4,-72);
    ctx.lineTo(-4,-130);
    ctx.strokeStyle = 'rgba(255,220,100,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Flag
    ctx.beginPath();
    ctx.moveTo(-4,-130);
    ctx.lineTo(24,-120);
    ctx.lineTo(-4,-110);
    ctx.closePath();
    const flagG = ctx.createLinearGradient(-4,-130,24,-120);
    flagG.addColorStop(0,'#ff3333');
    flagG.addColorStop(1,'#ff6666');
    ctx.fillStyle = flagG;
    ctx.fill();

    // ── Smokestack
    ctx.beginPath();
    ctx.roundRect(-36,-56,12,20,3);
    ctx.fillStyle = '#444';
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-37,-58,14,6,2);
    ctx.fillStyle = '#333';
    ctx.fill();

    // ── Railing lines
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-60,-28);
    ctx.lineTo(68,-28);
    ctx.stroke();

    // ── Stern (rounded back)
    ctx.beginPath();
    ctx.ellipse(-58, -14, 10, 18, 0.2, 0, Math.PI*2);
    ctx.fillStyle = '#b8872a';
    ctx.fill();

    ctx.restore();
  }
}

window.WaterPhysics = WaterPhysics;
window.BoatPhysics  = BoatPhysics;
