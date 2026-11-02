/**
 * Âm thanh tổng hợp bằng WebAudio (không cần file). OBS / TikTok LIVE Studio thu được tiếng của Browser Source
 * khi bật "Control audio via OBS". Trên trình duyệt thường cần 1 lần click/phím để bật âm thanh.
 */
export class Sfx {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastLaser = 0;
  muted = false;

  private ensure() {
    if (this.muted) return null;
    if (!this.ac) {
      try {
        this.ac = new AudioContext();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ac.destination);
        const len = this.ac.sampleRate;
        this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        return null;
      }
    }
    if (this.ac.state === "suspended") void this.ac.resume().catch(() => {});
    return this.ac.state === "running" ? this.ac : null;
  }

  unlock() {
    this.ensure();
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const ac = this.ensure();
    if (!ac || !this.master) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, freq: number, delay = 0) {
    const ac = this.ensure();
    if (!ac || !this.master || !this.noise) return;
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(60, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  laser() {
    const now = performance.now();
    if (now - this.lastLaser < 70) return;
    this.lastLaser = now;
    this.tone("square", 1400 + Math.random() * 300, 240, 0.09, 0.05);
  }
  launch() {
    this.burst(0.35, 0.25, 2400);
  }
  hit(big = false) {
    this.burst(big ? 0.8 : 0.25, big ? 0.6 : 0.2, big ? 900 : 1800);
  }
  boom() {
    this.burst(2.2, 0.9, 700);
    this.tone("sine", 90, 30, 1.4, 0.6);
  }
  siren() {
    this.tone("sawtooth", 520, 880, 0.45, 0.06);
    this.tone("sawtooth", 880, 520, 0.45, 0.06, 0.45);
  }
  push() {
    this.tone("sine", 300, 900, 0.25, 0.12);
  }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone("triangle", f, f, 0.32, 0.18, i * 0.12));
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone("sawtooth", f, f * 0.97, 0.38, 0.08, i * 0.22));
  }
}
