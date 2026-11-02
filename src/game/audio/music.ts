import type { BossId } from "../bosses";
import { Engine, midi } from "./engine";
import { THEMES, type Theme } from "./themes";

/**
 * Nhạc nền tự soạn theo nhịp (synthwave điện ảnh, giọng La thứ), đổi theo diễn biến trận — chuyển ở đầu ô nhịp:
 *
 *  calm   (chờ, nghỉ giữa vòng)   90 BPM  pad êm + arpeggio thưa, không trống
 *  battle (đang đánh)            112 BPM  kick 4/4, snare, hi-hat, bass nảy, arpeggio 16 nốt — Am F C G
 *  danger (UFO sắp chạm đất)     128 BPM  hi-hat dày, bass 16 nốt, trống dồn, tiếng rít dâng — Am B♭ Am E
 *  boss   (vòng trùm)            chủ đề RIÊNG từng boss (themes.ts); gần chạm đất thì dồn dập thêm
 *                                 (boss chưa có chủ đề: 100 BPM nửa nhịp nặng — Dm B♭ Gm A)
 *  + đoạn kèn chiến thắng / nhạc thua phát một lần rồi về calm.
 */

export type Mode = "calm" | "battle" | "danger" | "boss";

interface Chord {
  notes: number[];
  root: number;
}
const C = (root: number, ...notes: number[]): Chord => ({ root, notes });
const PROG: Record<Mode, Chord[]> = {
  calm: [C(45, 57, 60, 64), C(41, 57, 60, 65), C(48, 55, 60, 64), C(43, 55, 59, 62)],
  battle: [C(45, 57, 60, 64), C(41, 57, 60, 65), C(48, 55, 60, 64), C(43, 55, 59, 62)],
  danger: [C(45, 57, 60, 64), C(46, 58, 62, 65), C(45, 57, 60, 64), C(40, 56, 59, 64)],
  boss: [C(38, 57, 62, 65), C(46, 58, 62, 65), C(43, 58, 62, 67), C(45, 57, 61, 64)],
};
const BPM: Record<Mode, number> = { calm: 90, battle: 112, danger: 128, boss: 100 };
const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 3, 2, 1, 2];

export class Music {
  private mode: Mode = "calm";
  private want: Mode = "calm";
  private step = 0;
  private bar = 0;
  private next = 0;
  private sting: { kind: "win" | "lose"; t: number } | null = null;
  private quietUntil = 0;
  /** độ sáng âm sắc (đạn vàng → mở bộ lọc) */
  bright = 1;
  /** boss đang đánh (chọn chủ đề) & boss sắp đổi sang */
  private theme: BossId | null = null;
  private wantTheme: BossId | null = null;
  /** UFO sắp chạm đất: chủ đề boss dồn dập thêm */
  intense = false;

  /** chọn chủ đề boss (null = nhạc trùm chung) — đổi ở đầu ô nhịp kế tiếp */
  setTheme(id: BossId | null) {
    this.wantTheme = id;
  }

  private get th(): Theme | null {
    return this.mode === "boss" && this.theme ? THEMES[this.theme] ?? null : null;
  }

  constructor(private e: Engine) {}

  start(t: number) {
    this.next = t + 0.08;
  }

  set(mode: Mode) {
    this.want = mode;
  }

  /** kèn thắng / nhạc thua: phát ngay ở nốt móc kế tiếp, tạm ngắt nhạc nền */
  play(kind: "win" | "lose") {
    this.sting = { kind, t: 0 };
  }

  /** xếp lịch các nốt tới thời điểm `until` (gọi đều đặn ~25 ms; offline gọi 1 lần cho cả đoạn) */
  schedule(until: number) {
    while (this.next < until) {
      const th = this.th;
      // 6/8: 12 bước mỗi ô = 4 phách chấm (mỗi bước = nốt móc đơn chia ba)
      const sp = th ? (th.steps === 12 ? 60 / th.bpm / 3 : 60 / th.bpm / 4) : 60 / BPM[this.mode] / 4;
      if (this.sting && this.sting.t === 0) {
        this.sting.t = this.next;
        this.quietUntil = this.next + (this.sting.kind === "win" ? 3.4 : 3.6);
        if (this.sting.kind === "win") this.fanfare(this.next);
        else this.lament(this.next);
        this.sting = null;
        this.want = "calm";
      }
      if (this.next >= this.quietUntil) this.tick(this.next, sp);
      this.next += sp;
      this.step++;
    }
  }

  private tick(t: number, sp: number) {
    const s = this.step % (this.th?.steps ?? 16);
    if (s === 0) {
      if (this.want !== this.mode || (this.want === "boss" && this.wantTheme !== this.theme)) {
        this.theme = this.wantTheme;
        const from = this.mode;
        this.mode = this.want;
        this.bar = 0;
        this.step = 0;
        if (from === "calm" && this.mode !== "calm") this.impact(t);
      } else this.bar++;
    }
    const m = this.mode;
    const ch = PROG[m][this.bar % 4];
    const barDur = sp * 16;
    const b = this.bright;
    if (m === "calm") {
      if (s === 0) {
        this.pad(t, ch.notes, barDur * 1.05, 0.6, 0.045);
        this.bass(t, ch.root, barDur * 0.9, 0.1, 500);
      }
      if (this.bar % 2 === 1 && s % 2 === 0) this.arp(t, this.arpNote(ch, s) + 12, sp * 1.8, 0.022, 1800);
      if (s === 0 && this.bar % 2 === 0) this.kick(t, 0.35);
      return;
    }
    if (m === "battle") {
      if (s % 4 === 0) this.kick(t, 0.9);
      if (s === 4 || s === 12) this.snare(t, 0.8);
      if (this.bar % 4 === 3 && s >= 12) this.snare(t, 0.35 + (s - 12) * 0.12);
      if (s % 2 === 0) this.hat(t, 0.5, false);
      if (s % 4 === 2) this.hat(t, 0.35, true);
      if (s % 2 === 0) this.bass(t, ch.root + (s % 4 === 2 ? 12 : 0), sp * 1.6, 0.2, 900);
      this.arp(t, this.arpNote(ch, s) + 12, sp * 0.9, 0.032, 2600 * b);
      if (s === 0) this.pad(t, ch.notes, barDur, 0.9 * b, 0.03);
      return;
    }
    if (m === "danger") {
      if (s % 4 === 0 || s === 14) this.kick(t, 1);
      if (s === 4 || s === 12) this.snare(t, 0.9);
      if (this.bar % 2 === 1 && s >= 13) this.snare(t, 0.5);
      this.hat(t, s % 2 === 0 ? 0.55 : 0.3, false);
      this.bass(t, ch.root + (s % 2 === 1 ? 12 : 0), sp * 0.85, 0.2, 1300);
      this.arp(t, this.arpNote(ch, s) + 24, sp * 0.8, 0.03, 3600 * b);
      if (s === 0) this.pad(t, ch.notes, barDur, 1.3 * b, 0.032);
      if (s === 0 && this.bar % 4 === 2) this.riser(t, barDur * 2);
      return;
    }
    const th = this.th;
    if (th) {
      this.bossTheme(this.theme!, th, t, s, sp);
      return;
    }
    // boss: nửa nhịp nặng nề
    if (s === 0 || s === 6 || s === 10) this.kick(t, 1);
    if (s === 8) this.snare(t, 1);
    if (s % 2 === 0) this.hat(t, 0.4, false);
    if (this.bar % 4 === 3 && s >= 8) this.tom(t, 150 - (s - 8) * 12);
    if (s % 2 === 0) this.bass(t, ch.root - 12 + (s === 6 || s === 14 ? 12 : 0), sp * 1.7, 0.24, 700);
    if (s === 0) {
      this.brass(t, ch.notes.map((n) => n - 12), sp * 6, 0.05);
      this.choir(t, ch.notes, barDur * 1.05, 0.03);
    }
    if (s % 4 === 0) this.arp(t, this.arpNote(ch, s) + 12, sp * 2.5, 0.028, 2200 * b);
  }

  /** Phối khí chủ đề riêng từng boss */
  private bossTheme(id: BossId, th: Theme, t: number, s: number, sp: number) {
    const bar = this.bar % 4;
    const ch = th.prog[bar];
    const barDur = sp * th.steps;
    const b = this.bright;
    const hot = this.intense;
    const mel = th.melody?.[bar];
    const note = mel && s % 2 === 0 ? mel[s / 2] ?? null : null;
    // gần chạm đất: hi-hat dày & tiếng rít dâng mỗi 2 ô nhịp
    if (hot) {
      if (s % 2 === 1) this.hat(t, 0.35, false);
      if (s === 0 && this.bar % 2 === 0) this.riser(t, barDur * 2);
    }
    switch (id) {
      case "gold": {
        // hành khúc: kick 1 & 3, snare 2 & 4 + trống dồn, kèn trumpet giai điệu, chuông, chiêng đầu câu
        if (s === 0 || s === 8) this.kick(t, 0.9);
        if (s === 4 || s === 12) this.snare(t, 0.8);
        if (s === 14 || s === 15 || (bar === 3 && s >= 10)) this.snare(t, 0.35);
        if (s % 4 === 2) this.hat(t, 0.35, false);
        if (s % 4 === 0) this.bass(t, ch.root + (s === 8 ? 7 : 0), sp * 3, 0.2, 800);
        if (note) this.trumpet(t, note, sp * 1.8, 0.05 * b);
        if (s === 0) {
          this.pad(t, ch.notes, barDur, 0.9 * b, 0.025);
          if (bar === 0) this.gong(t, 0.5);
        }
        if (s % 4 === 2) this.bell(t, ch.notes[((s / 4) | 0) % ch.notes.length] + 12, 0.6, 0.03);
        return;
      }
      case "octopus": {
        // 6/8: kick 1, snare 4 (bước 6), bass "ục ục" trượt, theremin rùng rợn
        if (s === 0 || (s === 9 && bar % 2 === 1)) this.kick(t, 0.85);
        if (s === 6) this.snare(t, 0.6);
        if (s % 3 === 0) this.hat(t, 0.3, false);
        if (s % 3 === 0) this.wobble(t, ch.root + (s === 6 ? 12 : 0), sp * 2.6, 0.22);
        if (note) this.theremin(t, note, sp * 2.8, 0.05);
        if (s === 0) this.choir(t, ch.notes, barDur * 1.05, 0.022);
        return;
      }
      case "stealth": {
        // điện tử tối giản: kick 4/4 nghẹt, clap 2 & 4, hi-hat 16 nốt, bass nghịch phách, pluck staccato, ra-đa
        if (s % 4 === 0) this.kick(t, 0.75);
        if (s === 4 || s === 12) this.clap(t, 0.7);
        this.hat(t, s % 2 ? 0.25 : 0.45, false);
        if (s % 4 === 2) this.bass(t, ch.root + 12, sp * 1.5, 0.2, 1200);
        if ([0, 3, 6, 10, 13].includes(s)) this.pluck(t, this.arpNote(ch, s) + 12, sp * 0.8, 0.045, 3200 * b);
        if (s === 0) this.ping(t, 0.05);
        if (s === 0) this.pad(t, ch.notes, barDur, 0.5, 0.018);
        return;
      }
      case "spider": {
        // công nghiệp: kick lệch phách, tiếng kim loại thay snare, arpeggio 16 nốt lách cách, bass méo 16 nốt
        if ([0, 3, 8, 10].includes(s)) this.kick(t, 1);
        if (s === 4 || s === 12) this.clang(t, 0.8);
        if (s % 4 === 2) this.clang(t, 0.25);
        this.bass(t, ch.root + (s % 4 === 3 ? 12 : 0), sp * 0.8, 0.18, 1600);
        this.pluck(t, this.arpNote(ch, s) + 24, sp * 0.6, 0.03, 4500 * b);
        if (s === 0) this.pad(t, ch.notes, barDur, 0.4, 0.016);
        return;
      }
      case "devourer": {
        // doom: kick rỗng sâu, snare vang dội, bass dưới âm trượt xuống cuối ô, hợp xướng tối, kèn đồng rất trầm
        if (s === 0 || (s === 6 && bar % 2 === 1)) this.kick(t, 1.2);
        if (s === 8) this.snare(t, 1);
        if (s % 4 === 0) this.hat(t, 0.25, true);
        if (s === 0) {
          this.sub(t, ch.root, barDur, 0.5, bar === 3);
          this.choir(t, ch.notes.map((n) => n - 12), barDur * 1.05, 0.032);
          this.brass(t, [ch.root + 12, ch.root + 19], barDur * 0.7, 0.05);
        }
        if (bar === 3 && s >= 12) this.tom(t, 110 - (s - 12) * 10);
        return;
      }
      case "crystal": {
        // chuông pha lê arpeggio 16 nốt, pad sáng, trống nhẹ
        if (s === 0 || s === 8) this.kick(t, 0.7);
        if (s === 12) this.snare(t, 0.45);
        if (s % 2 === 0) this.hat(t, 0.3, false);
        this.bell(t, this.arpNote(ch, s) + 12, 0.5, 0.022 * b);
        if (s % 4 === 0) this.bass(t, ch.root, sp * 3.5, 0.14, 700);
        if (s === 0) this.pad(t, ch.notes, barDur * 1.05, 1.4 * b, 0.028);
        return;
      }
      case "mother": {
        // sử thi: taiko, hợp xướng dày, kèn đồng nhấn, giai điệu kèn
        if ([0, 3, 6, 10, 12].includes(s)) this.taiko(t, s === 0 ? 1.2 : 0.8);
        if (s === 8) this.snare(t, 0.9);
        if (s % 4 === 2) this.hat(t, 0.3, false);
        if (s % 2 === 0) this.bass(t, ch.root - 12 + (s % 8 === 6 ? 12 : 0), sp * 1.8, 0.22, 700);
        if (s === 0) this.choir(t, ch.notes, barDur * 1.05, 0.038);
        if (s === 0 || s === 10) this.brass(t, ch.notes.map((n) => n - 12), sp * 4, 0.05);
        if (note) this.trumpet(t, note, sp * 1.9, 0.04 * b);
        return;
      }
      case "planet": {
        // u ám: chuông nguyện hồn mỗi ô, kick nặng lệch, snare to, hợp xướng, kèn trầm
        if (s === 0 || s === 7 || s === 10) this.kick(t, 1.1);
        if (s === 8) this.snare(t, 1);
        if (s % 2 === 0) this.hat(t, 0.25, false);
        if (s === 0) {
          this.toll(t, ch.root + 24);
          this.choir(t, ch.notes, barDur * 1.05, 0.03);
          this.brass(t, [ch.root, ch.root + 7].map((n) => n + 12), barDur * 0.6, 0.045);
        }
        if (s % 4 === 0) this.bass(t, ch.root, sp * 3.8, 0.24, 500);
        return;
      }
      case "dragon": {
        // sử thi nhanh: double-kick, snare 2 & 4, dây tremolo, kèn đồng giai điệu, hợp xướng, cymbal đầu câu
        if (s % 2 === 0 || (bar === 3 && s >= 8)) this.kick(t, s % 4 === 0 ? 1 : 0.6);
        if (s === 4 || s === 12) this.snare(t, 0.95);
        if (s % 2 === 0) this.hat(t, 0.4, s % 8 === 6);
        this.strings(t, this.arpNote(ch, s % 4) + 12, sp * 0.9, 0.022 * b);
        if (s % 4 === 0) this.bass(t, ch.root + (s % 8 === 4 ? 12 : 0), sp * 3.6, 0.22, 900);
        if (note) this.brass(t, [note - 12, note], sp * 1.9, 0.045 * b);
        if (s === 0) {
          this.choir(t, ch.notes, barDur * 1.05, 0.034);
          if (bar === 0) this.cymbal(t, 1);
        }
        if (bar === 3 && s >= 12) this.tom(t, 170 - (s - 12) * 20);
        return;
      }
      default:
        return;
    }
  }

  private arpNote(ch: Chord, s: number) {
    const tones = [...ch.notes, ch.notes[0] + 12];
    return tones[ARP[s] % tones.length];
  }

  // ---------------- nhạc cụ ----------------

  private kick(t: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.music);
    const o = e.osc("sine", 150, t, 0.45, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    e.env(g.gain, t, 0.95 * v, 0.003, 0.38);
    const c = e.gain(0, e.music);
    e.noiseSrc(t, 0.02, c);
    e.env(c.gain, t, 0.08 * v, 0.001, 0.015);
    // nén theo kick: bass & pad lùi xuống rồi trồi lên (cảm giác "thở")
    e.duck.gain.cancelScheduledValues(t);
    e.duck.gain.setValueAtTime(0.35, t);
    e.duck.gain.linearRampToValueAtTime(1, t + 0.22);
  }

  private snare(t: number, v: number) {
    const e = this.e;
    const bus = e.share("snare", () => {
      const bp = e.filter("bandpass", 1900, 0.8);
      bp.connect(e.gain(1, e.music, 0.25));
      return bp;
    });
    const g = e.gain(0, bus);
    e.noiseSrc(t, 0.2, g);
    e.env(g.gain, t, 0.38 * v, 0.002, 0.17);
    const tg = e.gain(0, e.music);
    const o = e.osc("triangle", 200, t, 0.15, tg);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.1);
    e.env(tg.gain, t, 0.28 * v, 0.002, 0.1);
  }

  private hat(t: number, v: number, open: boolean) {
    const e = this.e;
    const bus = e.share("hat", () => {
      const hp = e.filter("highpass", 7800);
      hp.connect(e.pan(e.music, 700));
      return hp;
    });
    const g = e.gain(0, bus);
    e.noiseSrc(t, open ? 0.25 : 0.05, g);
    e.env(g.gain, t, 0.11 * v, 0.001, open ? 0.2 : 0.04);
  }

  private tom(t: number, f: number) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.3);
    const o = e.osc("sine", f * 1.6, t, 0.4, g);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    e.env(g.gain, t, 0.5, 0.003, 0.32);
  }

  private bass(t: number, n: number, dur: number, v: number, cut: number) {
    const e = this.e;
    const g = e.gain(0, e.duck);
    const lp = e.filter("lowpass", cut, 4);
    lp.connect(g);
    lp.frequency.setValueAtTime(cut * 2.4, t);
    lp.frequency.exponentialRampToValueAtTime(cut * 0.45, t + Math.min(0.25, dur));
    e.osc("sawtooth", midi(n), t, dur, lp);
    e.osc("square", midi(n - 12), t, dur, lp);
    e.hold(g.gain, t, v, 0.006, Math.max(0.01, dur - 0.06), 0.06);
  }

  private arp(t: number, n: number, dur: number, v: number, cut: number) {
    const e = this.e;
    const g = e.gain(0, e.pan(e.music, this.step % 2 ? 360 : 720), 0.35);
    const lp = e.filter("lowpass", cut, 2);
    lp.connect(g);
    lp.frequency.setValueAtTime(cut, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, cut * 0.25), t + 0.18);
    e.osc("sawtooth", midi(n), t, dur, lp, 4);
    e.env(g.gain, t, v * 1.2, 0.004, dur);
  }

  private pad(t: number, notes: number[], dur: number, bright: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.duck, 0.45);
    const lp = e.filter("lowpass", 700 + 900 * bright, 0.8);
    lp.connect(g);
    for (const n of notes) {
      e.osc("sawtooth", midi(n), t, dur, lp, -9);
      e.osc("sawtooth", midi(n), t, dur, lp, 9);
    }
    e.osc("triangle", midi(notes[0] - 12), t, dur, lp);
    e.hold(g.gain, t, v, Math.min(0.5, dur * 0.3), Math.max(0.05, dur * 0.55), dur * 0.4);
  }

  private brass(t: number, notes: number[], dur: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.3);
    const lp = e.filter("lowpass", 400, 1.5);
    lp.connect(g);
    lp.frequency.setValueAtTime(350, t);
    lp.frequency.linearRampToValueAtTime(2600, t + 0.08);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.6);
    for (const n of notes) for (const d of [-8, 0, 8]) e.osc("sawtooth", midi(n), t, dur, lp, d);
    e.hold(g.gain, t, v, 0.04, dur * 0.6, dur * 0.4);
  }

  private choir(t: number, notes: number[], dur: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.duck, 0.6);
    // hai dải lọc formant "aa" cho cảm giác hợp xướng
    const f1 = e.filter("bandpass", 800, 3);
    const f2 = e.filter("bandpass", 1250, 4);
    f1.connect(g);
    f2.connect(g);
    for (const n of notes) {
      const o = e.osc("sawtooth", midi(n), t, dur, f1, -5);
      o.connect(f2);
      const o2 = e.osc("sawtooth", midi(n), t, dur, f1, 6);
      o2.connect(f2);
    }
    e.hold(g.gain, t, v * 3, dur * 0.35, dur * 0.35, dur * 0.3);
  }

  // ---------------- nhạc cụ cho chủ đề boss ----------------

  /** chuông / glockenspiel: hoạ âm không điều hoà tắt dần */
  private bell(t: number, n: number, dur: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.pan(e.music, this.step % 2 ? 380 : 700), 0.5);
    for (const [m, a] of [[1, 1], [2.76, 0.4], [5.4, 0.15]] as const) {
      const og = e.gain(a, g);
      e.osc("sine", midi(n) * m, t, dur, og);
    }
    e.env(g.gain, t, v, 0.002, dur);
  }

  /** chuông nguyện hồn: chuông lớn ngân dài, vang */
  private toll(t: number, n: number) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.8);
    for (const [m, a] of [[0.5, 0.6], [1, 1], [1.19, 0.5], [2, 0.4], [2.76, 0.25]] as const) e.osc("sine", midi(n) * m, t, 3, e.gain(a, g));
    e.env(g.gain, t, 0.06, 0.003, 2.8);
  }

  private gong(t: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.7);
    for (const m of [1, 1.47, 2.09, 2.56, 3.4]) e.osc("sine", 98 * m, t, 4, g);
    const n = e.gain(0, e.music, 0.6);
    const bp = e.filter("bandpass", 600, 0.7);
    bp.connect(n);
    e.noiseSrc(t, 2.5, bp);
    e.env(n.gain, t, 0.05 * v, 0.01, 2.4);
    e.env(g.gain, t, 0.12 * v, 0.02, 3.8);
  }

  /** kèn trumpet: 1 nốt, răng cưa lọc mở nhanh + rung nhẹ */
  private trumpet(t: number, n: number, dur: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.3);
    const lp = e.filter("lowpass", 600, 2);
    lp.connect(g);
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.linearRampToValueAtTime(3800, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(1800, t + dur);
    for (const d of [-6, 6]) e.osc("sawtooth", midi(n), t, dur, lp, d);
    e.hold(g.gain, t, v, 0.03, dur * 0.7, dur * 0.3);
  }

  /** theremin: sine trượt nốt + rung sâu */
  private theremin(t: number, n: number, dur: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.5);
    const o = e.osc("sine", midi(n) * 0.97, t, dur, g);
    o.frequency.exponentialRampToValueAtTime(midi(n), t + 0.08);
    const vib = e.ctx.createOscillator();
    const vg = e.ctx.createGain();
    vib.frequency.value = 6.5;
    vg.gain.value = midi(n) * 0.018;
    vib.connect(vg).connect(o.frequency);
    vib.start(t);
    vib.stop(t + dur);
    e.osc("triangle", midi(n) * 2, t, dur, e.gain(0.15, g));
    e.hold(g.gain, t, v, 0.06, dur * 0.6, dur * 0.35);
  }

  /** bass "ục ục": bộ lọc quét lên xuống (wobble) */
  private wobble(t: number, n: number, dur: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.duck);
    const lp = e.filter("lowpass", 300, 8);
    lp.connect(g);
    lp.frequency.setValueAtTime(220, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + dur * 0.35);
    lp.frequency.exponentialRampToValueAtTime(200, t + dur);
    e.osc("sawtooth", midi(n), t, dur, lp);
    e.osc("square", midi(n - 12), t, dur, lp, 8);
    e.hold(g.gain, t, v, 0.01, dur * 0.8, dur * 0.2);
  }

  /** pluck: răng cưa lọc đóng rất nhanh (tiếng gảy) */
  private pluck(t: number, n: number, dur: number, v: number, cut: number) {
    const e = this.e;
    const g = e.gain(0, e.pan(e.music, this.step % 2 ? 300 : 780), 0.3);
    const lp = e.filter("lowpass", cut, 6);
    lp.connect(g);
    lp.frequency.setValueAtTime(cut, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.09);
    e.osc("sawtooth", midi(n), t, dur, lp);
    e.env(g.gain, t, v, 0.002, dur);
  }

  /** dây tremolo (violin nhanh) */
  private strings(t: number, n: number, dur: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.pan(e.music, this.step % 2 ? 330 : 750), 0.4);
    const lp = e.filter("lowpass", 2600, 1);
    lp.connect(g);
    for (const d of [-8, 7]) e.osc("sawtooth", midi(n), t, dur, lp, d);
    e.env(g.gain, t, v, 0.01, dur);
  }

  /** sub bass dưới âm, có thể trượt xuống cuối ô */
  private sub(t: number, n: number, dur: number, v: number, slide: boolean) {
    const e = this.e;
    const g = e.gain(0, e.duck);
    const o = e.osc("sine", midi(n - 12), t, dur, g);
    if (slide) o.frequency.exponentialRampToValueAtTime(midi(n - 17), t + dur);
    const lp = e.filter("lowpass", 260, 3);
    lp.connect(g);
    e.osc("sawtooth", midi(n - 12), t, dur, lp);
    e.hold(g.gain, t, v, 0.05, dur * 0.8, dur * 0.2);
  }

  /** trống taiko: thân trầm + mặt da */
  private taiko(t: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.5);
    const o = e.osc("sine", 120, t, 0.6, g);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
    const lp = e.filter("lowpass", 900);
    lp.connect(g);
    e.noiseSrc(t, 0.08, lp);
    e.env(g.gain, t, 0.9 * v, 0.003, 0.55);
  }

  /** tiếng kim loại (thay snare cho nhạc công nghiệp) */
  private clang(t: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.3);
    for (const m of [1, 1.48, 2.13, 2.9]) e.osc("square", 420 * m, t, 0.25, g);
    const bp = e.filter("bandpass", 3200, 4);
    bp.connect(g);
    e.noiseSrc(t, 0.12, bp);
    e.env(g.gain, t, 0.07 * v, 0.001, 0.18);
  }

  private clap(t: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.3);
    const bp = e.filter("bandpass", 1300, 1.5);
    bp.connect(g);
    e.noiseSrc(t, 0.2, bp);
    g.gain.setValueAtTime(0.0001, t);
    for (const d of [0, 0.012, 0.024]) {
      g.gain.setValueAtTime(0.3 * v, t + d);
      g.gain.exponentialRampToValueAtTime(0.02, t + d + 0.01);
    }
    g.gain.setValueAtTime(0.25 * v, t + 0.036);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  }

  /** tiếng ra-đa "pinggg" */
  private ping(t: number, v: number) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.8);
    e.osc("sine", 1760, t, 0.9, g);
    e.env(g.gain, t, v, 0.002, 0.85);
  }

  private riser(t: number, dur: number) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.3);
    const hp = e.filter("bandpass", 400, 2);
    hp.connect(g);
    hp.frequency.setValueAtTime(300, t);
    hp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    e.noiseSrc(t, dur, hp);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.95);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
  }

  private cymbal(t: number, v: number, dur = 1.8) {
    const e = this.e;
    const g = e.gain(0, e.music, 0.4);
    const hp = e.filter("highpass", 5200);
    hp.connect(g);
    e.noiseSrc(t, dur, hp);
    e.env(g.gain, t, 0.2 * v, 0.002, dur);
  }

  /** đòn mở màn khi bắt đầu trận: kick sâu + cymbal */
  private impact(t: number) {
    this.kick(t, 1.2);
    this.cymbal(t, 0.9);
    const e = this.e;
    const g = e.gain(0, e.music, 0.5);
    const o = e.osc("sine", 70, t, 1.2, g);
    o.frequency.exponentialRampToValueAtTime(32, t + 1);
    e.env(g.gain, t, 0.7, 0.005, 1.1);
  }

  /** kèn chiến thắng: C – F – G – C, giai điệu đi lên, trống định âm & cymbal */
  private fanfare(t: number) {
    const q = 0.2;
    const seq: [number, number[], number][] = [
      [0, [60, 64, 67], q * 1.5],
      [q * 1.5, [60, 64, 67], q * 0.5],
      [q * 2, [65, 69, 72], q * 2],
      [q * 4, [67, 71, 74], q * 2],
      [q * 6, [72, 76, 79], q * 7],
    ];
    for (const [dt, ch, d] of seq) this.brass(t + dt, ch, d, 0.055);
    [72, 76, 79, 84].forEach((n, i) => this.arp(t + q * 6 + i * 0.07, n, 0.6, 0.05, 4000));
    for (let i = 0; i < 6; i++) this.tom(t + q * 4 + i * 0.07, 110);
    this.kick(t + q * 6, 1.2);
    this.cymbal(t + q * 6, 1.2, 2.6);
    this.pad(t + q * 6, [60, 64, 67, 72], 2.2, 1.4, 0.04);
  }

  /** nhạc thua: hợp xướng tối, bass đi xuống Am – F – Dm – E */
  private lament(t: number) {
    const chords = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]];
    chords.forEach((c, i) => this.choir(t + i * 0.8, c, 1.1, 0.035));
    [45, 41, 38, 40].forEach((n, i) => this.bass(t + i * 0.8, n, 0.75, 0.22, 400));
    this.impact(t);
    this.tom(t + 3.2, 70);
  }
}
