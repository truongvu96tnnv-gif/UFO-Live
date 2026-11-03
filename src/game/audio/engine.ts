/**
 * Lõi âm thanh (WebAudio, tự tổng hợp — không cần file nhạc, không lo bản quyền):
 *
 *   nhạc ─┬─ duck (bass, pad: tự hạ khi trống kick đánh) ─┐
 *         └───────────────────────────────────────────────┴─ music ─┐
 *   hiệu ứng ─────────────────────────────────────────────── sfx ───┼─ master ─ nén ─ chặn đỉnh ─ loa
 *   phòng vang (reverb) ◀─ gửi từ nhạc & hiệu ứng ───────────────────┘
 *
 * Dùng được với AudioContext (chơi thật) lẫn OfflineAudioContext (xuất file nghe thử).
 */

export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Engine {
  readonly master: GainNode;
  readonly music: GainNode;
  readonly duck: GainNode;
  readonly sfx: GainNode;
  /** hạ nhạc nền / hiệu ứng khi đang lồng tiếng (1 = bình thường) */
  readonly musicDuck: GainNode;
  readonly sfxDuck: GainNode;
  readonly verb: GainNode;
  readonly noise: AudioBuffer;
  /** 2 giây tiếng lách tách dựng sẵn (mảnh vỡ, tàn lửa) — 1 nguồn thay cho hàng chục nguồn nhỏ */
  readonly crackleBuf: AudioBuffer;
  private pans = new Map<AudioNode, Map<number, AudioNode>>();
  private shared = new Map<string, AudioNode>();

  constructor(readonly ctx: BaseAudioContext) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -3;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.1;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(comp).connect(limit).connect(ctx.destination);

    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.master);
    this.sfxDuck = ctx.createGain();
    this.sfxDuck.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.5;
    this.music.connect(this.musicDuck);
    this.duck = ctx.createGain();
    this.duck.connect(this.music);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.sfxDuck);

    // phòng vang: xung phản hồi tự tạo (nhiễu stereo tắt dần ~2,6 s)
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    this.verb = ctx.createGain();
    this.verb.connect(conv).connect(wet).connect(this.master);

    const nlen = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    this.crackleBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const cd = this.crackleBuf.getChannelData(0);
    for (let k = 0; k < 160; k++) {
      const at = Math.floor(Math.random() * (nlen - 2000));
      const len = 80 + Math.floor(Math.random() * 900);
      const amp = 0.3 + Math.random() * 0.7;
      for (let i = 0; i < len; i++) cd[at + i] += (Math.random() * 2 - 1) * amp * Math.pow(1 - i / len, 3);
    }
  }

  /** nút dùng chung (bộ lọc tĩnh…) — tạo 1 lần theo khoá */
  share(key: string, make: () => AudioNode) {
    let n = this.shared.get(key);
    if (!n) this.shared.set(key, (n = make()));
    return n;
  }

  get now() {
    return this.ctx.currentTime;
  }

  gain(v: number, dest: AudioNode, send = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(dest);
    if (send > 0) {
      const s = this.ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.verb);
    }
    return g;
  }

  /** bộ lọc */
  filter(type: BiquadFilterType, f: number, q = 0.7) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  /** đặt vị trí trái–phải theo toạ độ sân khấu (0..1080) */
  pan(dest: AudioNode, x?: number) {
    if (x === undefined) return dest;
    // làm tròn về 9 vị trí & dùng lại bộ chia trái–phải (đỡ tạo nút mới mỗi tiếng)
    const q = Math.round(Math.max(-1, Math.min(1, (x / 1080) * 2 - 1)) * 4) / 4;
    let m = this.pans.get(dest);
    if (!m) this.pans.set(dest, (m = new Map()));
    let p = m.get(q);
    if (!p) {
      const sp = this.ctx.createStereoPanner();
      sp.pan.value = q * 0.65;
      sp.connect(dest);
      m.set(q, (p = sp));
    }
    return p;
  }

  /** phát 1 đoạn tiếng lách tách dài `dur` giây qua bộ lọc thông cao (độ sáng theo `rate`) */
  crackle(t: number, dur: number, dest: AudioNode, v: number, rate = 1) {
    const g = this.gain(0, dest);
    const s = this.ctx.createBufferSource();
    s.buffer = this.crackleBuf;
    s.playbackRate.value = rate;
    s.connect(g);
    s.start(t, Math.random() * 0.8, dur);
    g.gain.setValueAtTime(v, t);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
  }

  osc(type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noiseSrc(t: number, dur: number, dest: AudioNode, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  /** bao biên âm lượng: lên trong a giây tới đỉnh, tắt dần về 0 sau d giây */
  env(p: AudioParam, t: number, peak: number, a: number, d: number) {
    p.cancelScheduledValues(t);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  /** giữ đều: lên a, giữ tới hết hold, tắt r */
  hold(p: AudioParam, t: number, peak: number, a: number, hold: number, r: number) {
    p.cancelScheduledValues(t);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.setValueAtTime(peak, t + a + hold);
    p.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  }

  sweep(p: AudioParam, t: number, from: number, to: number, dur: number) {
    p.setValueAtTime(from, t);
    p.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  }
}
