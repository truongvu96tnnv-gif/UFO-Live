import type { BossId } from "../bosses";
import { Engine, midi } from "./engine";
import { crackle, explode, horn, megaBoom } from "./fx";

/**
 * "Giọng" riêng của từng boss (xuất hiện · bị đau · tấn công · gục ngã), tiếng trúng đạn theo chất liệu thân,
 * và 5 kiểu tiếng súng laser — mỗi người xem được gán cố định 1 kiểu nên nghe là biết "súng của ai".
 */

const r = (a: number, b: number) => a + Math.random() * (b - a);

export type Material = "metal" | "gold" | "flesh" | "glass" | "rock";
export const MATERIAL: Record<BossId, Material> = {
  ufo: "metal",
  ufo2: "metal",
  ufo3: "metal",
  gold: "gold",
  octopus: "flesh",
  stealth: "metal",
  spider: "metal",
  dragon: "metal",
  devourer: "rock",
  crystal: "glass",
  mother: "metal",
  planet: "rock",
};

// ======================= tiếng súng của người xem =======================

export const LASER_KINDS = ["pew", "zap", "blaster", "plasma", "rail"] as const;
export type LaserKind = (typeof LASER_KINDS)[number];

/** Laser 5 kiểu: pew (cổ điển) · zap (điện FM) · blaster (súng nổ) · plasma (ục ục) · rail (nòng ray, chát chúa) */
export function laserShot(e: Engine, t: number, kind: LaserKind, x?: number, gold = false) {
  const out = e.pan(e.sfx, x);
  const g = e.gain(0, out, 0.1);
  const p = r(0.92, 1.08) * (gold ? 1.25 : 1);
  switch (kind) {
    case "pew": {
      const o = e.osc("square", 1800 * p, t, 0.14, g);
      o.frequency.exponentialRampToValueAtTime(380 * p, t + 0.12);
      const o2 = e.osc("sawtooth", 2700 * p, t, 0.12, g, 12);
      o2.frequency.exponentialRampToValueAtTime(520 * p, t + 0.1);
      e.env(g.gain, t, 0.032, 0.002, 0.12);
      break;
    }
    case "zap": {
      // điều tần: tiếng xẹt điện rè
      const car = e.osc("sawtooth", 900 * p, t, 0.16, g);
      const mod = e.ctx.createOscillator();
      const mg = e.ctx.createGain();
      mod.frequency.value = 230 * p;
      mg.gain.value = 1400;
      mod.connect(mg).connect(car.frequency);
      mod.start(t);
      mod.stop(t + 0.17);
      car.frequency.exponentialRampToValueAtTime(140, t + 0.15);
      e.env(g.gain, t, 0.03, 0.001, 0.15);
      break;
    }
    case "blaster": {
      const o = e.osc("square", 520 * p, t, 0.12, g);
      o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
      const bp = e.filter("bandpass", 2500, 1);
      bp.connect(g);
      e.noiseSrc(t, 0.07, bp);
      e.env(g.gain, t, 0.05, 0.001, 0.1);
      break;
    }
    case "plasma": {
      // ục ục: rung biên độ nhanh trên âm trầm-trung
      const o = e.osc("sine", 340 * p, t, 0.22, g);
      o.frequency.exponentialRampToValueAtTime(900 * p, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(200 * p, t + 0.2);
      const o2 = e.osc("triangle", 680 * p, t, 0.2, g);
      o2.frequency.exponentialRampToValueAtTime(260 * p, t + 0.18);
      const lfo = e.ctx.createOscillator();
      const lg = e.ctx.createGain();
      lfo.frequency.value = 38;
      lg.gain.value = 0.03;
      lfo.connect(lg).connect(g.gain);
      lfo.start(t);
      lfo.stop(t + 0.22);
      e.env(g.gain, t, 0.045, 0.004, 0.2);
      break;
    }
    case "rail": {
      // tiếng "chát" khô + tiếng rít kim loại cao kéo dài
      const hp = e.filter("highpass", 3000);
      hp.connect(g);
      e.noiseSrc(t, 0.02, hp);
      const o = e.osc("sine", 5200 * p, t, 0.25, g);
      o.frequency.exponentialRampToValueAtTime(2600 * p, t + 0.22);
      const o2 = e.osc("square", 110, t, 0.05, g);
      o2.frequency.exponentialRampToValueAtTime(50, t + 0.04);
      e.env(g.gain, t, 0.04, 0.001, 0.22);
      break;
    }
  }
  if (gold) {
    const sg = e.gain(0, out, 0.3);
    e.osc("sine", midi(96) * r(0.98, 1.02), t + 0.02, 0.2, sg);
    e.env(sg.gain, t + 0.02, 0.018, 0.002, 0.18);
  }
}

/** Tên lửa hoa hồng / tên lửa bình luận: "vèo" huýt sáo đi lên như pháo hoa */
export function whistle(e: Engine, t: number, x?: number, v = 1) {
  const g = e.gain(0, e.pan(e.sfx, x), 0.2);
  const f = r(900, 1300);
  const o = e.osc("sine", f, t, 0.75, g);
  o.frequency.exponentialRampToValueAtTime(f * 2.6, t + 0.7);
  const lfo = e.ctx.createOscillator();
  const lg = e.ctx.createGain();
  lfo.frequency.value = 13;
  lg.gain.value = 40;
  lfo.connect(lg).connect(o.frequency);
  lfo.start(t);
  lfo.stop(t + 0.75);
  const hg = e.gain(0, e.pan(e.sfx, x));
  const bp = e.filter("bandpass", 3000, 2);
  bp.connect(hg);
  e.noiseSrc(t, 0.7, bp);
  e.env(hg.gain, t, 0.025 * v, 0.02, 0.65);
  e.hold(g.gain, t, 0.03 * v, 0.03, 0.5, 0.2);
}

/** Bom pháo giấy: "bốp" kiểu pháo bắn hoa giấy + xào xạc giấy */
export function popper(e: Engine, t: number, x?: number) {
  const out = e.pan(e.sfx, x);
  const g = e.gain(0, out, 0.25);
  const o = e.osc("sine", 260, t, 0.12, g);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
  e.noiseSrc(t, 0.05, g);
  e.env(g.gain, t, 0.45, 0.001, 0.1);
  const pg = e.gain(0, out);
  const hp = e.filter("bandpass", 5000, 0.8);
  hp.connect(pg);
  e.noiseSrc(t + 0.05, 1.2, hp);
  e.env(pg.gain, t + 0.05, 0.05, 0.05, 1.1);
}

// ======================= tiếng trúng đạn theo chất liệu =======================

/** kind: "laser" (nhẹ) · "rocket" (vừa) · "heavy" (nặng) */
export function impact(e: Engine, t: number, mat: Material, kind: "laser" | "rocket" | "heavy", x?: number) {
  const out = e.pan(e.sfx, x);
  const k = kind === "laser" ? 0.45 : kind === "rocket" ? 0.8 : 1.2;
  switch (mat) {
    case "metal": {
      // "keng" kim loại: hoạ âm không điều hoà tắt nhanh; thỉnh thoảng đạn nảy "piu"
      const g = e.gain(0, out, 0.25);
      const f = r(380, 620) * (kind === "laser" ? 1.6 : 1);
      for (const m of [1, 2.76, 5.4]) e.osc("triangle", f * m, t, 0.35, g);
      e.env(g.gain, t, 0.028 * k, 0.001, kind === "laser" ? 0.12 : 0.3);
      if (kind === "laser" && Math.random() < 0.18) {
        const rg = e.gain(0, out, 0.3);
        const o = e.osc("sine", r(2400, 3400), t + 0.03, 0.3, rg);
        o.frequency.exponentialRampToValueAtTime(r(900, 1300), t + 0.28);
        e.env(rg.gain, t + 0.03, 0.025, 0.002, 0.25);
      }
      break;
    }
    case "gold": {
      // chuông vàng ngân
      const g = e.gain(0, out, 0.35);
      const f = [1046, 1318, 1568, 2093][(Math.random() * 4) | 0];
      e.osc("sine", f, t, 0.8, g);
      e.osc("sine", f * 2.4, t, 0.4, g);
      e.env(g.gain, t, 0.03 * k, 0.001, kind === "laser" ? 0.25 : 0.7);
      break;
    }
    case "glass": {
      const g = e.gain(0, out, 0.4);
      for (let i = 0; i < (kind === "laser" ? 2 : 4); i++) {
        const tt = t + i * 0.02;
        e.osc("sine", r(3000, 6500), tt, 0.4, g);
      }
      e.env(g.gain, t, 0.022 * k, 0.001, kind === "laser" ? 0.18 : 0.4);
      break;
    }
    case "flesh": {
      // "bẹp" nhớp: nhiễu trầm lọc + quét tần xuống
      const g = e.gain(0, out, 0.1);
      const lp = e.filter("lowpass", 900, 6);
      lp.connect(g);
      e.sweep(lp.frequency, t, 1400, 250, 0.15);
      e.noiseSrc(t, 0.18, lp);
      const o = e.osc("sine", 300, t, 0.15, g);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
      e.env(g.gain, t, 0.12 * k, 0.003, 0.14);
      break;
    }
    case "rock": {
      const g = e.gain(0, out, 0.2);
      const lp = e.filter("lowpass", 700, 1);
      lp.connect(g);
      e.noiseSrc(t, 0.3, lp);
      e.osc("sine", 70, t, 0.25, g);
      e.env(g.gain, t, 0.14 * k, 0.002, 0.25);
      if (kind !== "laser") crackle(e, t + 0.05, 8, 0.5, out, 0.04, 1500);
      break;
    }
  }
}

// ======================= giọng boss =======================

/** Bộ cộng hưởng formant: biến dao động răng cưa thành tiếng "gào" có nguyên âm */
function growl(e: Engine, t: number, dur: number, f0: number, f1: number, vowel: [number, number], v: number, dest: AudioNode) {
  const g = e.gain(0, dest, 0.45);
  const a = e.filter("bandpass", vowel[0], 5);
  const b = e.filter("bandpass", vowel[1], 7);
  a.connect(g);
  b.connect(g);
  for (const d of [-14, 0, 13]) {
    const o = e.osc("sawtooth", f0, t, dur, a, d);
    o.connect(b);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const vib = e.ctx.createOscillator();
    const vg = e.ctx.createGain();
    vib.frequency.value = r(5, 7);
    vg.gain.value = f0 * 0.04;
    vib.connect(vg).connect(o.frequency);
    vib.start(t);
    vib.stop(t + dur);
  }
  e.hold(g.gain, t, v, 0.12, dur * 0.6, dur * 0.35);
}

/** Lúc boss xuất hiện */
export function bossIntro(e: Engine, t: number, id: BossId) {
  const out = e.sfx;
  switch (id) {
    case "ufo": {
      // theremin rền rĩ kiểu phim UFO cổ điển + "braam"
      const g = e.gain(0, out, 0.5);
      const o = e.osc("sine", 900, t, 2.6, g);
      o.frequency.exponentialRampToValueAtTime(320, t + 1.2);
      o.frequency.exponentialRampToValueAtTime(700, t + 2.4);
      const vib = e.ctx.createOscillator();
      const vg = e.ctx.createGain();
      vib.frequency.value = 6;
      vg.gain.value = 28;
      vib.connect(vg).connect(o.frequency);
      vib.start(t);
      vib.stop(t + 2.6);
      e.hold(g.gain, t, 0.07, 0.3, 1.6, 0.6);
      horn(e, t + 0.4, false);
      break;
    }
    case "ufo2": {
      // tiếng bíp tuần tra 3 nốt đi lên + "braam"
      [0, 0.18, 0.36].forEach((dt, i) => {
        const g = e.gain(0, out, 0.4);
        e.osc("square", [880, 1175, 1568][i], t + dt, 0.15, g);
        e.env(g.gain, t + dt, 0.04, 0.003, 0.13);
      });
      horn(e, t + 0.5, false);
      break;
    }
    case "ufo3": {
      // lõi plasma khởi động: tiếng sạc đi lên + rè điện + "braam"
      const g = e.gain(0, out, 0.4);
      const o = e.osc("sawtooth", 60, t, 1.2, g);
      o.frequency.exponentialRampToValueAtTime(700, t + 1.1);
      e.env(g.gain, t, 0.07, 0.8, 0.35);
      crackle(e, t + 0.3, 20, 1, out, 0.06, 4000);
      horn(e, t + 1, false);
      break;
    }
    case "gold": {
      // chiêng hoàng gia + hợp âm kèn trưởng
      const gg = e.gain(0, out, 0.6);
      for (const m of [1, 1.47, 2.09, 2.56, 3.4]) e.osc("sine", 110 * m, t, 4, gg);
      e.env(gg.gain, t, 0.12, 0.01, 3.6);
      horn(e, t, true);
      [60, 64, 67, 72].forEach((n, i) => {
        const g = e.gain(0, out, 0.3);
        const lp = e.filter("lowpass", 2400);
        lp.connect(g);
        e.osc("sawtooth", midi(n), t + 0.5 + i * 0.12, 1.6, lp);
        e.hold(g.gain, t + 0.5 + i * 0.12, 0.03, 0.05, 1, 0.5);
      });
      break;
    }
    case "octopus":
      growl(e, t, 2.2, 95, 60, [500, 900], 0.5, out);
      growl(e, t + 0.3, 1.8, 140, 80, [700, 1200], 0.25, out);
      squelch(e, t + 0.2, 6);
      break;
    case "stealth": {
      // phản lực lướt ngang trái → phải + tiếng ra-đa
      const pan = e.ctx.createStereoPanner();
      pan.connect(out);
      pan.pan.setValueAtTime(-0.9, t);
      pan.pan.linearRampToValueAtTime(0.9, t + 1.8);
      const g = e.gain(0, pan, 0.3);
      const bp = e.filter("bandpass", 800, 0.8);
      bp.connect(g);
      e.sweep(bp.frequency, t, 400, 2500, 0.9);
      e.noiseSrc(t, 2, bp);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      for (let i = 0; i < 3; i++) {
        const pg = e.gain(0, out, 0.6);
        e.osc("sine", 1760, t + 1.2 + i * 0.5, 0.3, pg);
        e.env(pg.gain, t + 1.2 + i * 0.5, 0.04, 0.002, 0.25);
      }
      break;
    }
    case "devourer":
      vortex(e, t, 2.5);
      growl(e, t + 0.6, 2, 70, 45, [380, 700], 0.5, out);
      horn(e, t + 0.3, true);
      break;
    case "dragon":
      roar(e, t + 0.2, true);
      horn(e, t, true);
      horn(e, t + 1.1, true);
      break;
    case "spider":
      servo(e, t, 14, out);
      spray(e, t + 0.9, 0.8);
      horn(e, t + 0.5, false);
      break;
    case "crystal": {
      // hợp âm pha lê dâng lên + tiếng ngân thuỷ tinh
      [72, 79, 84, 88, 91, 96].forEach((n, i) => {
        const g = e.gain(0, out, 0.6);
        e.osc("sine", midi(n), t + i * 0.15, 2.5, g);
        e.osc("sine", midi(n) * 2.76, t + i * 0.15, 1.2, g);
        e.env(g.gain, t + i * 0.15, 0.035, 0.05, 2.3);
      });
      horn(e, t + 0.8, true);
      break;
    }
    case "mother": {
      // "BRAAAM" khổng lồ kéo dài 2 lớp + chấn động
      horn(e, t, true);
      horn(e, t + 0.9, true);
      const g = e.gain(0, out, 0.4);
      const o = e.osc("sine", 40, t, 4, g);
      o.frequency.exponentialRampToValueAtTime(25, t + 3.8);
      e.hold(g.gain, t, 0.5, 0.4, 2.4, 1.1);
      break;
    }
    case "planet": {
      // động đất ầm ì + hợp xướng u ám + braam
      const g = e.gain(0, out, 0.4);
      const lp = e.filter("lowpass", 180);
      lp.connect(g);
      e.noiseSrc(t, 4, lp);
      e.osc("sine", 32, t, 4, lp);
      e.hold(g.gain, t, 0.6, 0.6, 2.4, 1);
      crackle(e, t + 0.5, 30, 3, out, 0.06, 1200);
      growl(e, t + 0.5, 3, 110, 98, [650, 1100], 0.18, out);
      horn(e, t + 1, true);
      break;
    }
  }
}

/** Xoáy hố đen: gió hút ù ù dâng dần + rền trầm (trả về hàm dừng) */
export function vortex(e: Engine, t: number, dur = 5): () => void {
  const g = e.gain(0, e.sfx, 0.4);
  const bp = e.filter("bandpass", 300, 1.5);
  bp.connect(g);
  e.sweep(bp.frequency, t, 200, 1600, dur);
  e.noiseSrc(t, dur, bp);
  const lfo = e.ctx.createOscillator();
  const lg = e.ctx.createGain();
  lfo.frequency.value = 3;
  lg.gain.value = 200;
  lfo.connect(lg).connect(bp.frequency);
  lfo.start(t);
  lfo.stop(t + dur);
  const o = e.osc("sine", 45, t, dur, g);
  o.frequency.exponentialRampToValueAtTime(30, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + Math.min(dur, 3));
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
  return () => {
    const n = e.now;
    g.gain.cancelScheduledValues(n);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
    g.gain.exponentialRampToValueAtTime(0.0001, n + 0.2);
  };
}

/** Nuốt: "ực" trầm khổng lồ */
export function gulp(e: Engine, t: number) {
  const g = e.gain(0, e.sfx, 0.4);
  const o = e.osc("sine", 160, t, 0.6, g);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.5);
  const lp = e.filter("lowpass", 500, 6);
  lp.connect(g);
  e.noiseSrc(t, 0.4, lp);
  e.env(g.gain, t, 0.7, 0.01, 0.55);
}

/** Tiếng gầm rồng: 2 lớp gào formant (trầm + rít kim loại) + rung đất */
export function roar(e: Engine, t: number, big = true, x?: number) {
  const out = e.pan(e.sfx, x);
  const d = big ? 2.4 : 1.1;
  growl(e, t, d, big ? 90 : 120, big ? 55 : 80, [420, 780], big ? 0.6 : 0.4, out);
  growl(e, t + 0.05, d * 0.9, big ? 260 : 320, big ? 150 : 200, [900, 2400], big ? 0.18 : 0.14, out);
  const g = e.gain(0, out, 0.3);
  const lp = e.filter("lowpass", 220);
  lp.connect(g);
  e.noiseSrc(t, d, lp);
  e.osc("sine", 38, t, d, lp);
  e.hold(g.gain, t, big ? 0.5 : 0.3, 0.1, d * 0.6, d * 0.3);
}

/** Hơi thở hư không: hít vào (nhiễu quét lên) rồi phun (gầm + rít điện) */
export function breath(e: Engine, t: number) {
  const g = e.gain(0, e.sfx, 0.4);
  const bp = e.filter("bandpass", 600, 1);
  bp.connect(g);
  e.sweep(bp.frequency, t, 3000, 300, 1.4);
  e.noiseSrc(t, 1.6, bp);
  e.hold(g.gain, t, 0.35, 0.05, 1, 0.5);
  const zg = e.gain(0, e.sfx, 0.4);
  const o = e.osc("sawtooth", 180, t, 1.5, zg);
  o.frequency.exponentialRampToValueAtTime(60, t + 1.4);
  e.osc("square", 271, t, 1.5, zg, 20);
  e.hold(zg.gain, t, 0.08, 0.05, 1, 0.4);
  crackle(e, t, 30, 1.4, e.sfx, 0.07, 4000);
}

/** tiếng chân nhện cơ khí: chuỗi "lách cách" servo tông cao */
export function servo(e: Engine, t: number, n: number, out: AudioNode = e.sfx) {
  for (let i = 0; i < n; i++) {
    const tt = t + i * r(0.045, 0.09);
    const g = e.gain(0, e.pan(out, r(200, 880)), 0.1);
    const o = e.osc("square", r(1800, 2600), tt, 0.05, g);
    o.frequency.exponentialRampToValueAtTime(r(600, 900), tt + 0.04);
    e.env(g.gain, tt, 0.03, 0.001, 0.035);
  }
}

/** phun tơ: tiếng "xì" nhiễu cao quét xuống */
export function spray(e: Engine, t: number, dur = 0.6) {
  const g = e.gain(0, e.sfx, 0.3);
  const bp = e.filter("bandpass", 5000, 1.2);
  bp.connect(g);
  e.sweep(bp.frequency, t, 7000, 1800, dur);
  e.noiseSrc(t, dur, bp);
  e.env(g.gain, t, 0.12, 0.02, dur);
}

/** xé lưới tơ: tiếng rách sột soạt + bật dây */
export function tear(e: Engine, t: number) {
  const g = e.gain(0, e.sfx, 0.3);
  const bp = e.filter("bandpass", 1500, 0.9);
  bp.connect(g);
  e.noiseSrc(t, 0.5, bp);
  e.env(g.gain, t, 0.3, 0.005, 0.45);
  crackle(e, t, 20, 0.5, e.sfx, 0.08, 2500);
  for (let i = 0; i < 4; i++) {
    const tt = t + i * 0.07;
    const sg = e.gain(0, e.pan(e.sfx, r(200, 880)), 0.2);
    const o = e.osc("triangle", r(180, 320), tt, 0.4, sg);
    o.frequency.exponentialRampToValueAtTime(r(80, 120), tt + 0.35);
    e.env(sg.gain, tt, 0.06, 0.002, 0.35);
  }
}

function squelch(e: Engine, t: number, n: number) {
  for (let i = 0; i < n; i++) {
    const tt = t + i * r(0.08, 0.2);
    const g = e.gain(0, e.pan(e.sfx, r(200, 880)), 0.2);
    const bp = e.filter("bandpass", r(300, 900), 8);
    bp.connect(g);
    e.sweep(bp.frequency, tt, r(900, 1500), r(200, 400), 0.15);
    e.noiseSrc(tt, 0.2, bp);
    e.env(g.gain, tt, 0.3, 0.005, 0.15);
  }
}

/** Boss bị trúng đòn nặng (kèm hoạt ảnh "hit") */
export function bossHurt(e: Engine, t: number, id: BossId, x?: number) {
  const out = e.pan(e.sfx, x);
  switch (id) {
    case "octopus":
      growl(e, t, 0.6, 180, 320, [700, 1300], 0.35, out);
      squelch(e, t, 2);
      return;
    case "planet":
      growl(e, t, 0.9, 70, 50, [450, 800], 0.3, out);
      crackle(e, t, 14, 0.8, out, 0.07, 1000);
      return;
    case "dragon":
      roar(e, t, false, x);
      return;
    case "devourer":
      growl(e, t, 0.8, 80, 60, [400, 760], 0.35, out);
      crackle(e, t, 10, 0.6, out, 0.06, 1200);
      return;
    case "spider": {
      servo(e, t, 6, out);
      const g = e.gain(0, out, 0.3);
      const o = e.osc("sawtooth", 1400, t, 0.4, g);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.35);
      e.env(g.gain, t, 0.05, 0.003, 0.35);
      return;
    }
    case "crystal": {
      const g = e.gain(0, out, 0.5);
      for (let i = 0; i < 5; i++) e.osc("sine", r(2500, 6000), t + i * 0.03, 0.6, g);
      e.env(g.gain, t, 0.05, 0.002, 0.5);
      return;
    }
    case "gold": {
      const g = e.gain(0, out, 0.5);
      for (const m of [1, 2.32, 4.25]) e.osc("sine", 520 * m, t, 1, g);
      e.env(g.gain, t, 0.07, 0.002, 0.9);
      return;
    }
    default: {
      // kim loại: thân tàu rung "boong" + chập điện xẹt
      const g = e.gain(0, out, 0.35);
      const f = id === "mother" ? 85 : 140;
      for (const m of [1, 1.58, 2.31, 3.1]) e.osc("triangle", f * m, t, 0.8, g);
      e.env(g.gain, t, 0.09, 0.002, 0.7);
      const zg = e.gain(0, out);
      const o = e.osc("sawtooth", 2400, t + 0.05, 0.25, zg);
      o.frequency.exponentialRampToValueAtTime(200, t + 0.28);
      e.env(zg.gain, t + 0.05, 0.03, 0.002, 0.22);
      crackle(e, t + 0.05, 10, 0.4, out, 0.05, 4000);
    }
  }
}

/** Boss bắn trả (UFO: sạc rồi xả 5 tia laser đỏ) */
export function bossAttack(e: Engine, t: number, id: BossId) {
  const out = e.sfx;
  const g = e.gain(0, out, 0.3);
  const o = e.osc("sawtooth", 110, t, 0.4, g);
  o.frequency.exponentialRampToValueAtTime(id === "mother" ? 500 : 900, t + 0.32);
  e.env(g.gain, t, 0.05, 0.28, 0.08);
  for (let i = 0; i < 5; i++) {
    const tt = t + 0.32 + i * 0.035;
    const lg = e.gain(0, e.pan(out, 180 + i * 180), 0.25);
    const lo = e.osc("sawtooth", 700, tt, 0.4, lg);
    lo.frequency.exponentialRampToValueAtTime(90, tt + 0.35);
    const lo2 = e.osc("square", 1050, tt, 0.3, lg, 15);
    lo2.frequency.exponentialRampToValueAtTime(140, tt + 0.28);
    e.env(lg.gain, tt, 0.04, 0.002, 0.35);
  }
}

/** Boss gục ngã: lớp tiếng riêng chồng lên vụ nổ lớn */
export function bossDeath(e: Engine, t: number, id: BossId) {
  // tắt máy: tiếng động cơ tụt dốc
  const g = e.gain(0, e.sfx, 0.4);
  const lp = e.filter("lowpass", 1200, 3);
  lp.connect(g);
  const o = e.osc("sawtooth", 260, t, 1.6, lp);
  o.frequency.exponentialRampToValueAtTime(30, t + 1.5);
  e.env(g.gain, t, 0.12, 0.02, 1.5);
  switch (id) {
    case "octopus":
      growl(e, t, 2, 160, 45, [600, 1000], 0.4, e.sfx);
      squelch(e, t + 0.4, 8);
      break;
    case "gold":
      for (let i = 0; i < 26; i++) {
        const tt = t + 0.5 + i * r(0.03, 0.08);
        const cg = e.gain(0, e.pan(e.sfx, r(150, 930)), 0.3);
        const f = r(1800, 2800);
        e.osc("sine", f, tt, 0.4, cg);
        e.osc("sine", f * 1.33, tt + 0.03, 0.35, cg);
        e.env(cg.gain, tt, 0.03, 0.002, 0.35);
      }
      break;
    case "crystal":
      for (let i = 0; i < 40; i++) {
        const tt = t + Math.random() * 1.2;
        const cg = e.gain(0, e.pan(e.sfx, r(150, 930)), 0.4);
        e.osc("sine", r(2200, 8000), tt, 0.6, cg);
        e.env(cg.gain, tt, r(0.01, 0.03), 0.001, r(0.1, 0.5));
      }
      break;
    case "devourer":
      growl(e, t, 2.2, 90, 30, [380, 700], 0.5, e.sfx);
      megaBoom(e, t + 1);
      break;
    case "dragon":
      roar(e, t, true);
      roar(e, t + 1.2, false);
      megaBoom(e, t + 1.6);
      break;
    case "spider":
      servo(e, t, 24, e.sfx);
      explode(e, t + 0.6, true, 300);
      explode(e, t + 0.8, true, 780);
      break;
    case "planet":
    case "mother":
      megaBoom(e, t + 0.9);
      crackle(e, t, 50, 3, e.sfx, 0.06, 1200);
      break;
    default:
      break;
  }
}
