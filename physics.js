// ── PHYSICS.JS ── Water surface & boat wave physics

class WaterPhysics {
  constructor(width) {
    this.width = width;
    this.numPoints = 120;
    this.spacing = width / (this.numPoints - 1);
    this.points = [];
    this.velocities = [];
    this.tension = 0.025;
    this.damping = 0.985;
    this.spread = 0.25;
    this.baseY = 0; // set externally

    for (let i = 0; i < this.numPoints; i++) {
      this.points.push(0);
      this.velocities.push(0);
    }
  }

  splash(x, force) {
    const idx = Math.round(x / this.spacing);
    if (idx >= 0 && idx < this.numPoints) {
      this.velocities[idx] += force;
      // spread initial force
      for (let d = 1; d <= 3; d++) {
        const f = force * (0.5 / d);
        if (idx + d < this.numPoints) this.velocities[idx + d] += f;
        if (idx - d >= 0) this.velocities[idx - d] += f;
      }
    }
  }

  update() {
    // Spring forces
    for (let i = 0; i < this.numPoints; i++) {
      const force = -this.tension * this.points[i];
      this.velocities[i] += force;
      this.velocities[i] *= this.damping;
    }

    // Propagate waves
    const lDeltas = new Array(this.numPoints).fill(0);
    const rDeltas = new Array(this.numPoints).fill(0);
    for (let pass = 0; pass < 8; pass++) {
      for (let i = 0; i < this.numPoints; i++) {
        if (i > 0) {
          lDeltas[i] = this.spread * (this.points[i] - this.points[i - 1]);
          this.velocities[i - 1] += lDeltas[i];
        }
        if (i < this.numPoints - 1) {
          rDeltas[i] = this.spread * (this.points[i] - this.points[i + 1]);
          this.velocities[i + 1] += rDeltas[i];
        }
      }
      for (let i = 0; i < this.numPoints; i++) {
        if (i > 0) this.points[i - 1] += lDeltas[i];
        if (i < this.numPoints - 1) this.points[i + 1] += rDeltas[i];
      }
    }

    for (let i = 0; i < this.numPoints; i++) {
      this.points[i] += this.velocities[i];
    }
  }

  getY(x) {
    const idx = x / this.spacing;
    const i = Math.floor(idx);
    const t = idx - i;
    const a = this.points[Math.max(0, Math.min(i, this.numPoints - 1))];
    const b = this.points[Math.max(0, Math.min(i + 1, this.numPoints - 1))];
    return this.baseY + a + (b - a) * t;
  }

  draw(ctx, scrollX, cameraY, canvasH) {
    ctx.save();
    // Water surface
    const pts = [];
    for (let i = 0; i < this.numPoints; i++) {
      pts.push({
        x: i * this.spacing - scrollX,
        y: this.baseY + this.points[i] - cameraY
      });
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(0, pts[0].y, 0, canvasH);
    grad.addColorStop(0, 'rgba(0, 140, 220, 0.75)');
    grad.addColorStop(0.3, 'rgba(0, 80, 160, 0.88)');
    grad.addColorStop(1, 'rgba(0, 10, 50, 0.98)');

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.lineTo(last.x, canvasH);
    ctx.lineTo(pts[0].x, canvasH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Surface shimmer line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(last.x, last.y);
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Foam dots
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < pts.length; i += 6) {
      if (Math.abs(this.velocities[i]) > 0.5) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

class BoatPhysics {
  constructor(x, waterPhysics) {
    this.x = x;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.angularVel = 0;
    this.width = 120;
    this.height = 40;
    this.waterPhysics = waterPhysics;
    this.onWater = true;
    this.bobOffset = 0;
    this.bobT = 0;
    // Ambient bob wave
    this.waveT = 0;
    this._prevY = 0;
    this._splashed = false;
  }

  update(dt, scrollX) {
    this.waveT += dt * 0.8;
    // Sample water at boat left, center, right
    const wL = this.waterPhysics.getY(this.x - 40 + scrollX);
    const wC = this.waterPhysics.getY(this.x + scrollX);
    const wR = this.waterPhysics.getY(this.x + 40 + scrollX);
    const wAvg = (wL + wC + wR) / 3;

    // Boat floats on water
    const targetY = wAvg - this.height * 0.35;
    this.y += (targetY - this.y) * 0.18;

    // Angle from slope
    const targetAngle = Math.atan2(wR - wL, 80) * 0.7;
    this.angle += (targetAngle - this.angle) * 0.12;

    // Horizontal gentle drift
    this.x += Math.sin(this.waveT * 0.4) * 0.3;
  }

  draw(ctx, scrollX, cameraY) {
    const sx = this.x - scrollX;
    const sy = this.y - cameraY;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.angle);

    // Hull shadow
    ctx.beginPath();
    ctx.ellipse(0, 8, 62, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Hull body
    const hullGrad = ctx.createLinearGradient(0, -20, 0, 20);
    hullGrad.addColorStop(0, '#d4a843');
    hullGrad.addColorStop(0.5, '#b8872a');
    hullGrad.addColorStop(1, '#7a5518');
    ctx.beginPath();
    ctx.moveTo(-60, 0);
    ctx.bezierCurveTo(-60, -18, -30, -22, 0, -22);
    ctx.bezierCurveTo(30, -22, 60, -18, 65, -5);
    ctx.bezierCurveTo(65, 10, 50, 18, 0, 18);
    ctx.bezierCurveTo(-50, 18, -60, 12, -60, 0);
    ctx.fillStyle = hullGrad;
    ctx.fill();
    ctx.strokeStyle = '#5a3d10';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Hull stripe
    ctx.beginPath();
    ctx.moveTo(-58, 4);
    ctx.bezierCurveTo(-30, 0, 30, 0, 63, 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Cabin
    const cabinGrad = ctx.createLinearGradient(0, -36, 0, -10);
    cabinGrad.addColorStop(0, '#e8e0d0');
    cabinGrad.addColorStop(1, '#c8bda8');
    ctx.beginPath();
    ctx.roundRect(-22, -38, 44, 26, 6);
    ctx.fillStyle = cabinGrad;
    ctx.fill();
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Cabin window
    ctx.beginPath();
    ctx.roundRect(-14, -33, 28, 14, 4);
    ctx.fillStyle = 'rgba(100,200,255,0.7)';
    ctx.fill();
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Mast
    ctx.beginPath();
    ctx.moveTo(-5, -38);
    ctx.lineTo(-5, -85);
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Flag
    ctx.beginPath();
    ctx.moveTo(-5, -85);
    ctx.lineTo(20, -76);
    ctx.lineTo(-5, -68);
    ctx.closePath();
    ctx.fillStyle = '#ff4444';
    ctx.fill();

    // Engine/motor back
    ctx.beginPath();
    ctx.roundRect(58, -4, 14, 16, 4);
    ctx.fillStyle = '#555';
    ctx.fill();

    ctx.restore();
  }
}

window.WaterPhysics = WaterPhysics;
window.BoatPhysics = BoatPhysics;
