import { Engine } from "./audio/engine";
import * as fx from "./audio/fx";
import { Music, type Mode } from "./audio/music";
import type { BossId } from "./bosses";

/**
 * Điều phối âm thanh của game: nhạc nền đổi theo trận, tiếng động cơ UFO, gió thành phố & hiệu ứng.
 * OBS / TikTok LIVE Studio cho phát tiếng ngay (bật "Control audio via OBS"); trình duyệt thường cần 1 lần chạm/phím.
 */

export interface AudioState {
  phase: "intro" | "battle" | "win" | "lose" | "break";
  progress: number;
  boss: BossId;
  bossKind: "normal" | "random" | "milestone";
  ufoAlive: boolean;
  golden: boolean;
}

/** tiếng động cơ từng trùm: tần số gốc, độ mở bộ lọc, âm lượng tương đối */
const HUM: Record<BossId, [number, number, number]> = {
  ufo: [48, 260, 1],
  gold: [55, 340, 0.9],
  octopus: [40, 200, 0.8],
  stealth: [64, 520, 0.6],
  cruiser: [36, 240, 1.2],
  crystal: [73, 760, 0.7],
  mother: [30, 210, 1.3],
  planet: [26, 180, 1.4],
};

export class Sfx {
  private ac: AudioContext | null = null;
  private e: Engine | null = null;
  private music: Music | null = null;
  private last = new Map<string, number>();
  private hum: { a: OscillatorNode; b: OscillatorNode; lp: BiquadFilterNode; g: GainNode } | null = null;
  private stopCharge: (() => void) | null = null;
  private _muted = false;
  private _musicOn = true;
  musicLevel = 0.5;

  /** đã phát được tiếng chưa (trình duyệt chặn tới khi người dùng chạm) */
  get running() {
    return this.ac?.state === "running";
  }

  get muted() {
    return this._muted;
  }
  set muted(v: boolean) {
    this._muted = v;
    if (this.e) this.e.master.gain.setTargetAtTime(v ? 0 : 0.85, this.e.now, 0.05);
  }

  get musicOn() {
    return this._musicOn;
  }
  set musicOn(v: boolean) {
    this._musicOn = v;
    if (this.e) this.e.music.gain.setTargetAtTime(v ? this.musicLevel : 0, this.e.now, 0.2);
  }

  /** tạo/đánh thức AudioContext — gọi lúc khởi động (OBS phát được ngay) và ở mỗi lần chạm/phím */
  unlock() {
    if (!this.ac) {
      try {
        this.ac = new AudioContext({ latencyHint: "interactive" });
      } catch {
        return;
      }
      const e = (this.e = new Engine(this.ac));
      e.master.gain.value = this._muted ? 0 : 0.85;
      e.music.gain.value = this._musicOn ? this.musicLevel : 0;
      this.music = new Music(e);
      this.music.start(e.now);
      this.ambience(e);
      window.setInterval(() => {
        if (this.ac?.state === "running") this.music!.schedule(this.ac.currentTime + 0.2);
      }, 30);
    }
    if (this.ac.state === "suspended") void this.ac.resume().catch(() => {});
  }

  /** gió đêm thành phố + động cơ UFO (chạy liên tục, chỉnh âm lượng theo trận) */
  private ambience(e: Engine) {
    const t = e.now;
    const wg = e.gain(0.022, e.sfx);
    const bp = e.filter("bandpass", 450, 0.6);
    bp.connect(wg);
    const src = e.ctx.createBufferSource();
    src.buffer = e.noise;
    src.loop = true;
    src.connect(bp);
    src.start(t);
    const lfo = e.ctx.createOscillator();
    const lg = e.ctx.createGain();
    lfo.frequency.value = 0.07;
    lg.gain.value = 260;
    lfo.connect(lg).connect(bp.frequency);
    lfo.start(t);

    const g = e.gain(0, e.sfx, 0.15);
    const lp = e.filter("lowpass", 260, 2);
    lp.connect(g);
    const a = e.ctx.createOscillator();
    const b = e.ctx.createOscillator();
    a.type = "sawtooth";
    b.type = "sawtooth";
    a.frequency.value = 48;
    b.frequency.value = 48.6;
    a.connect(lp);
    b.connect(lp);
    a.start(t);
    b.start(t);
    // "ù ù" kiểu động cơ đĩa bay: rung nhẹ tần số lọc
    const trem = e.ctx.createOscillator();
    const tg = e.ctx.createGain();
    trem.frequency.value = 5.5;
    tg.gain.value = 45;
    trem.connect(tg).connect(lp.frequency);
    trem.start(t);
    this.hum = { a, b, lp, g };
  }

  private get ok(): Engine | null {
    return this.e && this.ac?.state === "running" && !this._muted ? this.e : null;
  }

  /** chống dồn tiếng: cùng loại tiếng chỉ phát tối đa 1 lần / `ms` */
  private gate(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.last.get(key) ?? -1e9) < ms) return false;
    this.last.set(key, now);
    return true;
  }

  /** gọi mỗi khung: đổi nhạc theo trận, chỉnh tiếng động cơ */
  update(s: AudioState) {
    const e = this.ok;
    if (!e || !this.music) return;
    let mode: Mode = "calm";
    if (s.phase === "intro" || s.phase === "battle") mode = s.progress > 0.75 && s.phase === "battle" ? "danger" : s.bossKind !== "normal" ? "boss" : "battle";
    if (s.phase === "win" || s.phase === "lose" || s.phase === "break") mode = "calm";
    this.music.set(mode);
    this.music.bright = s.golden ? 1.6 : 1;
    if (this.hum) {
      const [f, cut, v] = HUM[s.boss];
      const on = s.ufoAlive && (s.phase === "intro" || s.phase === "battle" || s.phase === "lose");
      const level = on ? (0.03 + 0.06 * s.progress) * v : 0;
      this.hum.g.gain.setTargetAtTime(level, e.now, 0.3);
      this.hum.a.frequency.setTargetAtTime(f * (1 - 0.15 * s.progress), e.now, 0.5);
      this.hum.b.frequency.setTargetAtTime(f * 1.012 * (1 - 0.15 * s.progress), e.now, 0.5);
      this.hum.lp.frequency.setTargetAtTime(cut * (1 + s.progress), e.now, 0.5);
    }
  }

  // ---------------- hiệu ứng (giữ tên cũ để game gọi) ----------------

  laser(x?: number) {
    const e = this.ok;
    if (e && this.gate("laser", 55)) fx.laser(e, e.now, x);
  }
  heart(x?: number) {
    const e = this.ok;
    if (e && this.gate("heart", 70)) fx.heart(e, e.now, x);
  }
  bill(x?: number) {
    const e = this.ok;
    if (e && this.gate("bill", 60)) fx.bill(e, e.now, x);
  }
  /** size: 1 tên lửa thường · 1.6 hạng nặng · 2.2 siêu tên lửa */
  launch(size = 1, x?: number) {
    const e = this.ok;
    if (e && this.gate(`rocket${size}`, size > 1 ? 120 : 70)) fx.rocket(e, e.now, size, x);
  }
  hit(big = false, x?: number) {
    const e = this.ok;
    if (e && this.gate(big ? "hitB" : "hit", big ? 90 : 60)) fx.explode(e, e.now, big, x);
  }
  boom() {
    const e = this.ok;
    if (e) fx.megaBoom(e, e.now);
  }
  siren() {
    const e = this.ok;
    if (e && this.gate("siren", 1500)) fx.siren(e, e.now);
  }
  horn(boss = false) {
    const e = this.ok;
    if (e) fx.horn(e, e.now, boss);
  }
  push() {
    const e = this.ok;
    if (e && this.gate("push", 150)) fx.shield(e, e.now);
  }
  win() {
    const e = this.ok;
    this.music?.play("win");
    if (e) fx.cheer(e, e.now + 0.2);
  }
  lose() {
    this.music?.play("lose");
  }
  firework(x?: number) {
    const e = this.ok;
    if (e && this.gate("firework", 110)) fx.firework(e, e.now, x);
  }
  coin(x?: number) {
    const e = this.ok;
    if (e && this.gate("coin", 80)) fx.coin(e, e.now, x);
  }
  golden() {
    const e = this.ok;
    if (e) fx.golden(e, e.now);
  }
  crateDrop(x?: number) {
    const e = this.ok;
    if (e) fx.crateDrop(e, e.now, x);
  }
  crateOpen(x?: number) {
    const e = this.ok;
    if (e) fx.crateOpen(e, e.now, x);
  }
  beam(kind: "earth" | "twin" | "orbital", dur: number, x?: number) {
    const e = this.ok;
    if (e) fx.beam(e, e.now, kind, dur, x);
  }
  grab(x?: number) {
    const e = this.ok;
    if (e) fx.grab(e, e.now, x);
  }
  zap(x?: number) {
    const e = this.ok;
    if (e && this.gate("zap", 80)) fx.zap(e, e.now, x);
  }
  shieldUp() {
    const e = this.ok;
    if (e) fx.shieldUp(e, e.now);
  }
  shatter() {
    const e = this.ok;
    if (e) fx.shatter(e, e.now);
  }
  droneDrop() {
    const e = this.ok;
    if (e) fx.droneDrop(e, e.now);
  }
  chargeStart() {
    const e = this.ok;
    this.stopCharge?.();
    this.stopCharge = e ? fx.chargeUp(e, e.now, 5) : null;
  }
  /** ngắt tiếng sạc (bị cả phòng ngắt) */
  chargeStop() {
    this.stopCharge?.();
    this.stopCharge = null;
  }
  flak(x?: number) {
    const e = this.ok;
    if (e && this.gate("flak", 160)) fx.flak(e, e.now, x);
  }
}
