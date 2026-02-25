/* audio.js — Procedural Music & SFX Engine using Web Audio API */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.bpm = 128;
    this.beatInterval = 60 / this.bpm;
    this.masterGain = null;
    this.scheduledBeats = [];
    this.startTime = 0;
    this.nextBeatTime = 0;
    this.beatCount = 0;
    this.playing = false;
    this.scheduleAhead = 0.15;
    this.scheduleInterval = 0.05;
    this._timer = null;
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.6;
    this.masterGain.connect(this.ctx.destination);
  }

  // ---- SFX ----
  playHitFire() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const dist = this.ctx.createWaveShaper();
    dist.curve = this._makeDistortionCurve(200);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(dist);
    dist.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playHitIce() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // High bell-like shimmer
    [880, 1320, 1760].forEach((freq, i) => {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18 - i * 0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3 + i * 0.05);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.4);
    });
  }

  playMiss() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playPerfect() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523, 659, 784].forEach((f, i) => {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, now + i * 0.04);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.04 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.25);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.04);
      osc.stop(now + 0.4);
    });
  }

  playCountdown(n) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freq = n === 0 ? 880 : 440;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  // ---- MUSIC ----
  startMusic(bpm) {
    if (!this.ctx || this.playing) return;
    this.bpm = bpm;
    this.beatInterval = 60 / bpm;
    this.playing = true;
    this.beatCount = 0;
    this.startTime = this.ctx.currentTime + 0.1;
    this.nextBeatTime = this.startTime;
    this._schedulerLoop();
  }

  stopMusic() {
    this.playing = false;
    clearTimeout(this._timer);
  }

  _schedulerLoop() {
    while (this.nextBeatTime < this.ctx.currentTime + this.scheduleAhead) {
      this._scheduleBeat(this.beatCount, this.nextBeatTime);
      this.beatCount++;
      this.nextBeatTime += this.beatInterval;
    }
    if (this.playing) {
      this._timer = setTimeout(() => this._schedulerLoop(), this.scheduleInterval * 1000);
    }
  }

  _scheduleBeat(beat, time) {
    const bar  = Math.floor(beat / 16);
    const step = beat % 16;

    // KICK — on every 4 beats (0, 4, 8, 12)
    if (step % 4 === 0) this._kick(time);

    // SNARE — steps 4 and 12
    if (step === 4 || step === 12) this._snare(time);

    // HI-HAT — every even step
    if (step % 2 === 0) this._hihat(time, step % 4 === 0 ? 0.3 : 0.15);

    // FIRE BASS — pentatonic bassline
    const fireScale = [55, 65.41, 73.42, 87.31, 98, 110];
    if (step === 0 || step === 6 || step === 10 || step === 14) {
      const note = fireScale[beat % fireScale.length];
      this._bass(time, note, this.beatInterval * 0.8);
    }

    // ICE ARPEGGIO — counter-melody
    const iceScale = [523.25, 659.25, 783.99, 987.77, 1046.5];
    if (step % 3 === 1) {
      const note = iceScale[(beat * 3) % iceScale.length];
      this._arp(time, note);
    }

    // EVERY 8 BARS — add accent chord stab
    if (beat % 32 === 0) {
      this._chordStab(time);
    }
  }

  _kick(time) {
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(time); osc.stop(time + 0.25);
  }

  _snare(time) {
    // White noise
    const bufLen = this.ctx.sampleRate * 0.15;
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1200;
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    noise.start(time); noise.stop(time + 0.2);

    // Tone body
    const body = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.value = 180;
    bodyGain.gain.setValueAtTime(0.3, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    body.connect(bodyGain); bodyGain.connect(this.masterGain);
    body.start(time); body.stop(time + 0.1);
  }

  _hihat(time, vol) {
    const bufLen = this.ctx.sampleRate * 0.05;
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    noise.start(time); noise.stop(time + 0.06);
  }

  _bass(time, freq, duration) {
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.45, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
    osc.start(time); osc.stop(time + duration + 0.01);
  }

  _arp(time, freq) {
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + this.beatInterval * 0.6);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(time); osc.stop(time + this.beatInterval * 0.7);
  }

  _chordStab(time) {
    [261, 330, 392].forEach(f => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.08, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      osc.connect(gain); gain.connect(this.masterGain);
      osc.start(time); osc.stop(time + 0.35);
    });
  }

  _makeDistortionCurve(amount) {
    const samples = 256;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime - this.startTime : 0;
  }
}

window.audioEngine = new AudioEngine();
