/* particles.js — Fire & Ice Particle Engine */
class ParticleSystem {
  constructor() {
    this.canvas = document.getElementById('particleCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.active = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loop();
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  spawnFireBurst(x, y, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = Math.random() * 5 + 2;
      const size  = Math.random() * 12 + 4;
      this.particles.push({
        type: 'fire',
        x, y,
        vx: Math.cos(angle) * speed * (Math.random() * 0.6 + 0.4),
        vy: Math.sin(angle) * speed - Math.random() * 4,
        life: 1,
        decay: Math.random() * 0.025 + 0.02,
        size,
        hue: Math.random() * 40 + 10,
      });
    }
  }

  spawnIceBurst(x, y, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = Math.random() * 5 + 1.5;
      const size  = Math.random() * 10 + 3;
      this.particles.push({
        type: 'ice',
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: Math.random() * 0.02 + 0.015,
        size,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.15,
      });
    }
  }

  spawnMissBurst(x, y) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      this.particles.push({
        type: 'miss',
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.04,
        size: Math.random() * 6 + 3,
      });
    }
  }

  spawnAmbientFire() {
    // Subtle ambient fire along bottom
    if (Math.random() < 0.3) {
      const x = Math.random() * this.canvas.width;
      const y = this.canvas.height * 0.75 + Math.random() * 30;
      this.particles.push({
        type: 'fire',
        x, y,
        vx: (Math.random() - 0.5) * 1,
        vy: -(Math.random() * 2 + 1),
        life: 0.6,
        decay: 0.008,
        size: Math.random() * 8 + 2,
        hue: Math.random() * 30,
      });
    }
    // Subtle ambient ice along top
    if (Math.random() < 0.3) {
      const x = Math.random() * this.canvas.width;
      const y = this.canvas.height * 0.25 + Math.random() * 30 - 30;
      this.particles.push({
        type: 'ice',
        x, y,
        vx: (Math.random() - 0.5) * 1,
        vy: (Math.random() * 1.5 + 0.5),
        life: 0.5,
        decay: 0.008,
        size: Math.random() * 5 + 2,
        rotation: 0,
        rotSpeed: 0.05,
      });
    }
  }

  drawFire(p) {
    const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
    grad.addColorStop(0, `hsla(${p.hue + 50}, 100%, 90%, ${p.life})`);
    grad.addColorStop(0.4, `hsla(${p.hue + 20}, 100%, 60%, ${p.life * 0.8})`);
    grad.addColorStop(1, `hsla(${p.hue}, 100%, 30%, 0)`);
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    this.ctx.fillStyle = grad;
    this.ctx.fill();
  }

  drawIce(p) {
    this.ctx.save();
    this.ctx.translate(p.x, p.y);
    this.ctx.rotate(p.rotation);
    // Draw a 6-pointed snowflake-ish shape
    const alpha = p.life;
    this.ctx.strokeStyle = `rgba(150, 240, 255, ${alpha})`;
    this.ctx.lineWidth = 1.5;
    this.ctx.shadowColor = `rgba(0, 200, 255, ${alpha})`;
    this.ctx.shadowBlur = 8;
    const r = p.size;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      this.ctx.stroke();
      // Side arms
      const mx = Math.cos(a) * r * 0.5;
      const my = Math.sin(a) * r * 0.5;
      const perp = a + Math.PI / 2;
      this.ctx.beginPath();
      this.ctx.moveTo(mx - Math.cos(perp) * r * 0.25, my - Math.sin(perp) * r * 0.25);
      this.ctx.lineTo(mx + Math.cos(perp) * r * 0.25, my + Math.sin(perp) * r * 0.25);
      this.ctx.stroke();
    }
    // Center dot
    this.ctx.beginPath();
    this.ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2);
    this.ctx.fillStyle = `rgba(200, 250, 255, ${alpha})`;
    this.ctx.fill();
    this.ctx.restore();
  }

  drawMiss(p) {
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    this.ctx.fillStyle = `rgba(255, 60, 80, ${p.life * 0.8})`;
    this.ctx.fill();
  }

  update() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (window._gameRunning) {
      this.spawnAmbientFire();
    }

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.type === 'fire' ? 0.05 : 0.03; // gravity
      p.life -= p.decay;
      if (p.rotation !== undefined) p.rotation += p.rotSpeed;

      if (p.life <= 0) { this.particles.splice(i, 1); continue; }

      if (p.type === 'fire') this.drawFire(p);
      else if (p.type === 'ice') this.drawIce(p);
      else this.drawMiss(p);
    }

    this.ctx.restore();
  }

  loop() {
    this.update();
    requestAnimationFrame(() => this.loop());
  }
}

window.particles = new ParticleSystem();
