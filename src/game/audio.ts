// ============================================================
// audio.ts — процедурные звуки на WebAudio (без файлов)
// ============================================================

export class AudioSys {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  windGain: GainNode | null = null;
  windFilter: BiquadFilterNode | null = null;
  fireGain: GainNode | null = null;
  enabled = true;
  started = false;

  init() {
    if (this.started) return;
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AC();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      this.master = master;
      this.started = true;

      // ---- ветер: фильтрованный шум, бесконечный ----
      const noiseBuf = this.makeNoise(3);
      const windSrc = ctx.createBufferSource();
      windSrc.buffer = noiseBuf;
      windSrc.loop = true;
      const wf = ctx.createBiquadFilter();
      wf.type = 'lowpass';
      wf.frequency.value = 400;
      const wg = ctx.createGain();
      wg.gain.value = 0.05;
      windSrc.connect(wf);
      wf.connect(wg);
      wg.connect(master);
      windSrc.start();
      this.windFilter = wf;
      this.windGain = wg;
    } catch (e) {
      this.enabled = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  private makeNoise(sec: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // pinkish
      d[i] = last * 3.2;
    }
    return buf;
  }

  setWeather(kind: string, intensity: number) {
    if (!this.ctx || !this.windGain || !this.windFilter) return;
    const target = kind === 'blizzard' ? 0.32 : kind === 'snowfall' ? 0.14 : kind === 'overcast' ? 0.08 : 0.05;
    this.windGain.gain.setTargetAtTime(target * (0.6 + intensity * 0.4), this.ctx.currentTime, 2.5);
    this.windFilter.frequency.setTargetAtTime(kind === 'blizzard' ? 900 : 420, this.ctx.currentTime, 2);
  }

  private env(g: GainNode, t0: number, a: number, d: number, peak: number) {
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slideTo?: number) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = this.ctx.createGain();
    this.env(g, t0, 0.008, dur, vol);
    osc.connect(g); g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noiseBurst(dur: number, freq: number, vol = 0.25, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.makeNoise(Math.min(dur + 0.1, 1));
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const g = this.ctx.createGain();
    this.env(g, t0, 0.005, dur, vol);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.1);
  }

  // ---- события ----
  step() { this.noiseBurst(0.09, 3000 + Math.random() * 1500, 0.05); }
  chop() { this.noiseBurst(0.16, 900, 0.4); this.tone(140, 0.12, 'triangle', 0.25, 60); }
  mine() { this.noiseBurst(0.12, 2400, 0.35); this.tone(220, 0.1, 'square', 0.12, 120); }
  swing() { this.noiseBurst(0.12, 1200, 0.12, 'highpass'); }
  hitFlesh() { this.noiseBurst(0.14, 500, 0.4); this.tone(90, 0.15, 'triangle', 0.3, 40); }
  hitWood() { this.tone(180, 0.1, 'square', 0.2, 90); this.noiseBurst(0.08, 800, 0.2); }
  pickup() { this.tone(520, 0.09, 'sine', 0.16, 700); this.tone(780, 0.12, 'sine', 0.1); }
  craft() { this.tone(320, 0.15, 'triangle', 0.2); setTimeout(() => this.tone(480, 0.15, 'triangle', 0.18), 120); }
  ui() { this.tone(600, 0.05, 'sine', 0.08); }
  eat() { this.noiseBurst(0.2, 600, 0.15); }
  drink() { this.tone(300, 0.2, 'sine', 0.12, 500); }
  fireUp() {
    this.noiseBurst(0.5, 700, 0.3);
    if (!this.ctx || !this.master || !this.enabled) return;
    // постоянный треск огня включается вместе с костром (короткий)
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this.noiseBurst(0.06, 1500 + Math.random() * 2000, 0.06), i * 130);
    }
  }
  howl(dist: number) {
    const vol = Math.max(0.05, 0.35 - dist * 0.01);
    this.tone(320, 1.6, 'sawtooth', vol * 0.35, 240);
    setTimeout(() => this.tone(400, 1.2, 'sawtooth', vol * 0.25, 300), 400);
  }
  bearRoar() {
    this.tone(110, 0.8, 'sawtooth', 0.4, 60);
    this.noiseBurst(0.7, 300, 0.25, 'lowpass');
  }
  playerHurt() { this.tone(180, 0.25, 'sawtooth', 0.3, 80); this.noiseBurst(0.2, 500, 0.3); }
  levelUp() {
    this.tone(440, 0.12, 'triangle', 0.2);
    setTimeout(() => this.tone(550, 0.12, 'triangle', 0.2), 110);
    setTimeout(() => this.tone(660, 0.2, 'triangle', 0.22), 220);
  }
  notePickup() { this.tone(700, 0.1, 'sine', 0.12); setTimeout(() => this.tone(940, 0.14, 'sine', 0.1), 90); }
  death() {
    this.tone(220, 1.2, 'sawtooth', 0.3, 55);
    setTimeout(() => this.tone(160, 1.5, 'sawtooth', 0.25, 40), 500);
  }
  rescue() {
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.25), i * 180));
  }
}

export const audio = new AudioSys();
