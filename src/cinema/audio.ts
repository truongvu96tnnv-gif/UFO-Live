// Âm thanh rạp phim, tự tổng hợp bằng WebAudio (không file nhạc, không lo bản quyền):
// nền nhạc theo không khí cảnh, tiếng máy chiếu, tiếng bình chọn, trống dồn khi công bố, vỗ tay, nổ bỏng ngô.
import type { EndingKind, Mood } from "./films";

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** hợp âm nền (MIDI) cho từng không khí */
const PADS: Record<Mood | "lobby", { notes: number[]; bpm: number; arp: number[]; wave: OscillatorType }> = {
  lobby: { notes: [57, 60, 64, 67], bpm: 88, arp: [69, 72, 76, 72, 67, 72, 76, 79], wave: "triangle" },
  calm: { notes: [53, 57, 60, 64], bpm: 72, arp: [65, 69, 72, 76], wave: "sine" },
  happy: { notes: [55, 59, 62, 67], bpm: 104, arp: [67, 71, 74, 79, 74, 71], wave: "triangle" },
  funny: { notes: [60, 64, 67, 70], bpm: 120, arp: [72, 76, 79, 76, 72, 70], wave: "square" },
  tense: { notes: [50, 53, 56, 59], bpm: 96, arp: [62, 62, 65, 62, 68, 62], wave: "sawtooth" },
  spooky: { notes: [49, 52, 56, 61], bpm: 60, arp: [73, 72, 68, 67], wave: "sine" },
  epic: { notes: [50, 57, 62, 65], bpm: 112, arp: [62, 65, 69, 74, 69, 65], wave: "sawtooth" },
  sad: { notes: [57, 60, 64, 69], bpm: 64, arp: [76, 74, 72, 69], wave: "sine" },
};

export class CinemaAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private pad: { stop: () => void } | null = null;
  private mood: string = "";
  private arpTimer = 0;
  muted = false;
  musicOn = true;

  get running() {
    return this.ctx?.state === "running";
  }

  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      const c = this.ctx;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      this.master = c.createGain();
      this.master.connect(comp).connect(c.destination);
      this.music = c.createGain();
      this.music.gain.value = 0.32;
      this.music.connect(this.master);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.projector();
      const want = this.mood;
      this.mood = "";
      if (want) this.setMood(want as Mood);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  /** gọi mỗi khung hình: áp dụng tắt tiếng / tắt nhạc */
  update() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.05);
    this.music.gain.setTargetAtTime(this.musicOn ? 0.32 : 0, t, 0.2);
  }

  /** tiếng máy chiếu lạch cạch rất nhỏ */
  private projector() {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 3;
    const am = c.createGain();
    am.gain.value = 0;
    const lfo = c.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 24;
    const depth = c.createGain();
    depth.gain.value = 0.012;
    lfo.connect(depth).connect(am.gain);
    src.connect(bp).connect(am).connect(this.music);
    src.start();
    lfo.start();
  }

  setMood(mood: Mood | "lobby") {
    if (mood === this.mood) return;
    this.mood = mood;
    if (!this.ctx) return;
    const c = this.ctx;
    const p = PADS[mood];
    const t = c.currentTime;
    this.pad?.stop();
    const out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(1, t + 1.2);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = mood === "spooky" || mood === "sad" ? 900 : 1800;
    lp.connect(out).connect(this.music);
    const oscs = p.notes.flatMap((n) =>
      [-6, 6].map((det) => {
        const o = c.createOscillator();
        o.type = p.wave === "square" || p.wave === "sawtooth" ? "triangle" : p.wave;
        o.frequency.value = midi(n);
        o.detune.value = det;
        const g = c.createGain();
        g.gain.value = 0.06;
        o.connect(g).connect(lp);
        o.start(t);
        return o;
      }),
    );
    // arpeggio nhẹ theo nhịp
    window.clearInterval(this.arpTimer);
    let i = 0;
    const step = 60 / p.bpm / 2;
    this.arpTimer = window.setInterval(() => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.tone(midi(p.arp[i++ % p.arp.length]), p.wave, 0.035, step * 1.6, now, this.music);
    }, step * 1000);
    this.pad = {
      stop: () => {
        const now = c.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setTargetAtTime(0, now, 0.4);
        for (const o of oscs) o.stop(now + 2);
      },
    };
  }

  private tone(freq: number, type: OscillatorType, vol: number, dur: number, at?: number, dest?: AudioNode) {
    const c = this.ctx;
    if (!c) return;
    const t = at ?? c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, freq: number, vol: number, at?: number, q = 1) {
    const c = this.ctx;
    if (!c) return;
    const t = at ?? c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  vote(pick: 0 | 1) {
    this.tone(pick === 0 ? 880 : 1046, "triangle", 0.08, 0.12);
  }

  tick(last = false) {
    this.tone(last ? 1320 : 990, "square", 0.05, 0.06);
  }

  heart() {
    this.tone(1400 + Math.random() * 400, "sine", 0.03, 0.08);
  }

  popcorn(n = 4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < n; i++) this.burst(0.05, 1800 + Math.random() * 1600, 0.25, t + i * (0.04 + Math.random() * 0.08), 6);
  }

  applause(dur = 2.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < dur * 40; i++) this.burst(0.04, 1200 + Math.random() * 2400, 0.18 * (1 - i / (dur * 40)), t + i / 40 + Math.random() * 0.02, 2);
  }

  /** trống dồn trước khi công bố lựa chọn thắng */
  drumroll(dur = 1.8) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(dur * 26);
    for (let i = 0; i < n; i++) this.burst(0.06, 300, 0.12 + 0.3 * (i / n), t + i / 26, 1.2);
  }

  /** "tèn ten!" khi công bố */
  reveal() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(0.5, 200, 0.6, t, 0.8);
    for (const [i, n] of [72, 76, 79, 84].entries()) this.tone(midi(n), "sawtooth", 0.06, 0.6, t + 0.02 + i * 0.03);
  }

  /** nhạc khi hiện tên cái kết */
  ending(kind: EndingKind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const seq: Record<EndingKind, number[]> = { happy: [67, 72, 76, 79, 84], funny: [72, 71, 70, 69, 60], sad: [69, 67, 64, 62, 57], twist: [60, 66, 61, 67, 73] };
    seq[kind].forEach((n, i) => this.tone(midi(n), kind === "funny" ? "square" : "triangle", 0.09, 0.5, t + i * 0.18));
  }

  /** chuông báo phim sắp chiếu */
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [76, 72, 67, 72].forEach((n, i) => this.tone(midi(n), "sine", 0.1, 0.9, t + i * 0.32));
  }

  whoosh() {
    this.burst(0.5, 700, 0.2, undefined, 0.6);
  }
}
