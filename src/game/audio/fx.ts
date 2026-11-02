import { Engine, midi } from "./engine";

/**
 * Thư viện hiệu ứng âm thanh. Mỗi hàm nhận thời điểm `t` (giây theo đồng hồ âm thanh) và vị trí x trên sân khấu
 * (để đặt trái–phải), nên dùng được cả khi chơi thật lẫn khi xuất file nghe thử.
 */

const r = (a: number, b: number) => a + Math.random() * (b - a);

/** Laser: hai dao động quét xuống nhanh, hơi lệch tông mỗi phát cho đỡ nhàm */
export function laser(e: Engine, t: number, x?: number) {
  const g = e.gain(0, e.pan(e.sfx, x), 0.1);
  const f0 = r(1500, 2100);
  const o = e.osc("square", f0, t, 0.14, g);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.22, t + 0.12);
  const o2 = e.osc("sawtooth", f0 * 1.5, t, 0.12, g, 12);
  o2.frequency.exponentialRampToValueAtTime(f0 * 0.3, t + 0.1);
  e.env(g.gain, t, 0.035, 0.002, 0.12);
}

/** Đạn trái tim: "bụp" mềm, tông cao */
export function heart(e: Engine, t: number, x?: number) {
  const g = e.gain(0, e.pan(e.sfx, x), 0.2);
  const o = e.osc("sine", 700, t, 0.15, g);
  o.frequency.exponentialRampToValueAtTime(1400, t + 0.08);
  e.env(g.gain, t, 0.07, 0.004, 0.12);
}

/** Tờ tiền: tiếng lật giấy + "keng" xu nhỏ */
export function bill(e: Engine, t: number, x?: number) {
  const g = e.gain(0, e.pan(e.sfx, x));
  const hp = e.filter("bandpass", 4200, 1.5);
  hp.connect(g);
  e.noiseSrc(t, 0.06, hp);
  e.env(g.gain, t, 0.08, 0.002, 0.05);
  if (Math.random() < 0.35) coin(e, t + 0.03, x, 0.5);
}

/** Tên lửa rời bệ: tiếng rít gió (nhiễu quét dải) + "phụt" trầm; càng to càng dài & dày */
export function rocket(e: Engine, t: number, size = 1, x?: number) {
  const out = e.pan(e.sfx, x);
  const dur = 0.35 + 0.35 * size;
  const g = e.gain(0, out, 0.15);
  const bp = e.filter("bandpass", 600, 1.4);
  bp.connect(g);
  e.sweep(bp.frequency, t, 500, 3200, dur);
  e.noiseSrc(t, dur + 0.1, bp);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.2 * Math.min(1.6, size), t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const th = e.gain(0, out);
  const o = e.osc("sine", 130, t, 0.25, th);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  e.env(th.gain, t, 0.3 * Math.min(1.5, size), 0.003, 0.2);
  if (size >= 1.5) {
    // tên lửa lớn: thêm tiếng gầm động cơ
    const rg = e.gain(0, out, 0.2);
    const lp = e.filter("lowpass", 380);
    lp.connect(rg);
    e.noiseSrc(t, 1.2, lp);
    e.osc("sawtooth", 48, t, 1.1, lp);
    e.env(rg.gain, t, 0.22, 0.05, 1);
  }
}

/** Trúng đạn / nổ: ba lớp — "ục" trầm, bùng nhiễu tắt dần, lách tách mảnh vỡ; lớn thì vang xa */
export function explode(e: Engine, t: number, big = false, x?: number) {
  const out = e.pan(e.sfx, x);
  const k = big ? 1 : 0.55;
  const th = e.gain(0, out, big ? 0.35 : 0.12);
  const o = e.osc("sine", big ? 120 : 160, t, big ? 0.9 : 0.35, th);
  o.frequency.exponentialRampToValueAtTime(big ? 32 : 50, t + (big ? 0.6 : 0.22));
  e.env(th.gain, t, 0.7 * k, 0.003, big ? 0.85 : 0.3);
  const ng = e.gain(0, out, big ? 0.45 : 0.15);
  const lp = e.filter("lowpass", 3500, 0.9);
  lp.connect(ng);
  e.sweep(lp.frequency, t, big ? 4200 : 3000, 120, big ? 1.1 : 0.35);
  e.noiseSrc(t, big ? 1.3 : 0.45, lp);
  e.env(ng.gain, t, 0.6 * k, 0.002, big ? 1.1 : 0.35);
  crackle(e, t + 0.04, big ? 18 : 6, big ? 0.9 : 0.35, out, big ? 0.06 : 0.04);
}

/** Lách tách: nhiều cú nhấp ngắn ngẫu nhiên (mảnh vỡ, tàn lửa) */
export function crackle(e: Engine, t: number, n: number, spread: number, out: AudioNode, v = 0.05, hiF = 2500) {
  // 1 nguồn duy nhất: đoạn lách tách dựng sẵn, mật độ theo n, độ sáng theo hiF
  e.crackle(t, spread, out, v * Math.min(3, 0.6 + n / 10), hiF > 4000 ? 1.6 : hiF > 2000 ? 1.15 : 0.8);
}

/** UFO nổ tung: tiếng "ầm" dưới âm trầm kéo dài, 2 đợt nổ phụ, mưa mảnh vỡ, vang cả bầu trời */
export function megaBoom(e: Engine, t: number) {
  explode(e, t, true);
  explode(e, t + 0.35, true, 300);
  explode(e, t + 0.7, true, 780);
  const sg = e.gain(0, e.sfx, 0.5);
  const o = e.osc("sine", 70, t, 2.6, sg);
  o.frequency.exponentialRampToValueAtTime(22, t + 2.3);
  e.env(sg.gain, t, 0.9, 0.01, 2.4);
  const rg = e.gain(0, e.sfx, 0.5);
  const lp = e.filter("lowpass", 260);
  lp.connect(rg);
  e.noiseSrc(t, 3.2, lp);
  e.env(rg.gain, t, 0.5, 0.05, 3);
  crackle(e, t + 0.4, 40, 2.4, e.sfx, 0.05);
}

/** Pháo hoa: "bụp" + mưa lấp lánh tông cao */
export function firework(e: Engine, t: number, x?: number) {
  const out = e.pan(e.sfx, x);
  const g = e.gain(0, out, 0.4);
  const bp = e.filter("bandpass", 1100, 0.8);
  bp.connect(g);
  e.noiseSrc(t, 0.2, bp);
  e.env(g.gain, t, 0.3, 0.002, 0.14);
  const o = e.osc("sine", 320, t, 0.2, g);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.15);
  crackle(e, t + 0.15, 16, 0.9, out, 0.035, 5500);
}

/** Đồng xu: chuông kim loại 2 hoạ âm */
export function coin(e: Engine, t: number, x?: number, v = 1) {
  const g = e.gain(0, e.pan(e.sfx, x), 0.25);
  const f = r(0.97, 1.05);
  e.osc("sine", 1976 * f, t, 0.5, g);
  e.osc("sine", 2637 * f, t + 0.05, 0.45, g);
  e.env(g.gain, t, 0.05 * v, 0.002, 0.42);
}

/** ĐẠN VÀNG: chuỗi chuông đi lên + tiếng lấp lánh dâng */
export function golden(e: Engine, t: number) {
  [72, 76, 79, 84, 88, 91].forEach((n, i) => {
    const g = e.gain(0, e.sfx, 0.4);
    e.osc("sine", midi(n), t + i * 0.06, 0.8, g);
    e.osc("triangle", midi(n + 12), t + i * 0.06, 0.5, g);
    e.env(g.gain, t + i * 0.06, 0.06, 0.003, 0.7);
  });
  const sg = e.gain(0, e.sfx, 0.4);
  const hp = e.filter("highpass", 6000);
  hp.connect(sg);
  e.noiseSrc(t, 1, hp);
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.linearRampToValueAtTime(0.05, t + 0.4);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 1);
}

/** Rương xu rơi: tiếng gió lùa dù lượn (rung biên độ) */
export function crateDrop(e: Engine, t: number, x?: number) {
  const g = e.gain(0, e.pan(e.sfx, x), 0.2);
  const bp = e.filter("bandpass", 900, 1.2);
  bp.connect(g);
  e.sweep(bp.frequency, t, 1400, 400, 2.6);
  e.noiseSrc(t, 2.7, bp);
  const lfo = e.ctx.createOscillator();
  const lg = e.ctx.createGain();
  lfo.frequency.value = 9;
  lg.gain.value = 0.025;
  lfo.connect(lg).connect(g.gain);
  lfo.start(t);
  lfo.stop(t + 2.7);
  g.gain.setValueAtTime(0.04, t);
  g.gain.linearRampToValueAtTime(0.0001, t + 2.6);
}

/** Rương mở: "huỵch" gỗ + leng keng xu */
export function crateOpen(e: Engine, t: number, x?: number) {
  explode(e, t, false, x);
  for (let i = 0; i < 8; i++) coin(e, t + 0.05 + i * r(0.04, 0.09), x, 0.8);
}

/** Tia năng lượng: earth (pháo Trái Đất), twin (laser đôi kính râm), orbital (từ quỹ đạo) */
export function beam(e: Engine, t: number, kind: "earth" | "twin" | "orbital", dur: number, x?: number) {
  const out = e.pan(e.sfx, x);
  if (kind === "twin") {
    const g = e.gain(0, out, 0.2);
    const bp = e.filter("bandpass", 1600, 1.5);
    bp.connect(g);
    const a = e.osc("square", 440, t, dur, bp);
    const b = e.osc("square", 446, t, dur, bp);
    const lfo = e.ctx.createOscillator();
    const lg = e.ctx.createGain();
    lfo.frequency.value = 28;
    lg.gain.value = 40;
    lfo.connect(lg);
    lg.connect(a.frequency);
    lg.connect(b.frequency);
    lfo.start(t);
    lfo.stop(t + dur);
    e.hold(g.gain, t, 0.06, 0.05, dur - 0.25, 0.2);
    return;
  }
  const deep = kind === "orbital";
  // nạp: tiếng hút năng lượng đi lên
  const cg = e.gain(0, out, 0.3);
  const co = e.osc("sawtooth", 80, t, 0.5, cg);
  co.frequency.exponentialRampToValueAtTime(deep ? 900 : 600, t + 0.4);
  e.env(cg.gain, t, 0.08, 0.3, 0.15);
  // phóng: gầm trầm + rè điện suốt thời gian bắn
  const t1 = t + 0.35;
  const g = e.gain(0, out, deep ? 0.5 : 0.3);
  const lp = e.filter("lowpass", 300, 2);
  lp.connect(g);
  e.sweep(lp.frequency, t1, 300, deep ? 1800 : 2600, 0.4);
  e.osc("sawtooth", deep ? 36 : 55, t1, dur, lp);
  e.osc("sawtooth", deep ? 54.3 : 82.6, t1, dur, lp);
  e.noiseSrc(t1, dur, lp);
  e.hold(g.gain, t1, deep ? 0.32 : 0.22, 0.05, Math.max(0.1, dur - 0.45), 0.4);
  const hg = e.gain(0, out);
  const hp = e.filter("highpass", 3500);
  hp.connect(hg);
  e.noiseSrc(t1, dur, hp);
  e.hold(hg.gain, t1, 0.035, 0.05, Math.max(0.1, dur - 0.45), 0.3);
  explode(e, t1, true, x);
}

/** Còi báo động phòng không: hai còi lệch tông, rú lên rồi hạ xuống */
export function siren(e: Engine, t: number) {
  for (const [x, d] of [[200, 0], [880, 7]] as const) {
    const g = e.gain(0, e.pan(e.sfx, x), 0.35);
    const lp = e.filter("lowpass", 1500);
    lp.connect(g);
    const o = e.osc("sawtooth", 380, t, 1.9, lp, d);
    o.frequency.linearRampToValueAtTime(820, t + 0.9);
    o.frequency.linearRampToValueAtTime(380, t + 1.85);
    const s = e.osc("sine", 380, t, 1.9, lp, d);
    s.frequency.linearRampToValueAtTime(820, t + 0.9);
    s.frequency.linearRampToValueAtTime(380, t + 1.85);
    e.hold(g.gain, t, 0.035, 0.2, 1.3, 0.35);
  }
}

/** "BRAAAM" điện ảnh khi UFO / trùm xuất hiện */
export function horn(e: Engine, t: number, boss = false) {
  const g = e.gain(0, e.sfx, 0.6);
  const lp = e.filter("lowpass", 180, 1.2);
  lp.connect(g);
  lp.frequency.setValueAtTime(160, t);
  lp.frequency.linearRampToValueAtTime(boss ? 1400 : 900, t + 0.25);
  lp.frequency.exponentialRampToValueAtTime(220, t + 2);
  const root = boss ? 33 : 38;
  for (const n of [root, root + 7, root + 12]) for (const d of [-10, 0, 10]) e.osc("sawtooth", midi(n), t, 2.2, lp, d);
  e.hold(g.gain, t, boss ? 0.16 : 0.12, 0.08, 1.1, 0.9);
  explode(e, t, true);
}

/** Follow / chia sẻ: lá chắn bật — tiếng sạc năng lượng đi lên */
export function shield(e: Engine, t: number) {
  const g = e.gain(0, e.sfx, 0.35);
  const o = e.osc("square", 260, t, 0.4, g);
  o.frequency.exponentialRampToValueAtTime(1300, t + 0.32);
  const s = e.osc("sine", 520, t, 0.4, g);
  s.frequency.exponentialRampToValueAtTime(2600, t + 0.32);
  e.env(g.gain, t, 0.05, 0.02, 0.36);
  coin(e, t + 0.3, undefined, 0.7);
}

/** Bạch tuộc tóm: tiếng nhớp nháp (nhiễu trầm rung) + tiếng gầm méo */
export function grab(e: Engine, t: number, x?: number) {
  const out = e.pan(e.sfx, x);
  const g = e.gain(0, out, 0.3);
  const lp = e.filter("lowpass", 700, 3);
  lp.connect(g);
  e.noiseSrc(t, 0.8, lp);
  const lfo = e.ctx.createOscillator();
  const lg = e.ctx.createGain();
  lfo.frequency.value = 17;
  lg.gain.value = 0.12;
  lfo.connect(lg).connect(g.gain);
  lfo.start(t);
  lfo.stop(t + 0.8);
  const o = e.osc("sawtooth", 120, t, 0.8, lp);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.7);
  e.env(g.gain, t, 0.18, 0.05, 0.7);
}

/** Cầu điện phản công: "xẹt" quét xuống */
export function zap(e: Engine, t: number, x?: number) {
  const g = e.gain(0, e.pan(e.sfx, x), 0.2);
  const o = e.osc("sawtooth", 2600, t, 0.3, g);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.26);
  e.env(g.gain, t, 0.06, 0.002, 0.26);
  crackle(e, t, 6, 0.25, g, 0.06, 4000);
}

/** Khiên tinh thể dựng lên: hợp âm chuông pha lê */
export function shieldUp(e: Engine, t: number) {
  [84, 88, 91, 96].forEach((n, i) => {
    const g = e.gain(0, e.sfx, 0.5);
    e.osc("sine", midi(n), t + i * 0.05, 1.2, g);
    e.osc("sine", midi(n) * 2.76, t + i * 0.05, 0.6, g);
    e.env(g.gain, t + i * 0.05, 0.04, 0.005, 1.1);
  });
}

/** Khiên vỡ: tiếng kính vỡ vụn (nhiều hoạ âm cao tắt nhanh) + nổ */
export function shatter(e: Engine, t: number) {
  for (let i = 0; i < 28; i++) {
    const tt = t + Math.random() * 0.35;
    const g = e.gain(0, e.pan(e.sfx, r(200, 880)), 0.3);
    e.osc("sine", r(2200, 7500), tt, 0.5, g);
    e.env(g.gain, tt, r(0.01, 0.03), 0.001, r(0.08, 0.45));
  }
  const g = e.gain(0, e.sfx, 0.3);
  const hp = e.filter("highpass", 3000);
  hp.connect(g);
  e.noiseSrc(t, 0.4, hp);
  e.env(g.gain, t, 0.18, 0.002, 0.35);
  explode(e, t, true);
}

/** UFO con: thả xuống (bíp đi xuống) / bị bắn rơi */
export function droneDrop(e: Engine, t: number) {
  for (let i = 0; i < 2; i++) {
    const g = e.gain(0, e.sfx, 0.2);
    const o = e.osc("square", 1300, t + i * 0.12, 0.1, g);
    o.frequency.exponentialRampToValueAtTime(650, t + i * 0.12 + 0.09);
    e.env(g.gain, t + i * 0.12, 0.03, 0.002, 0.09);
  }
}

/** Mắt hủy diệt sạc: tiếng rít dâng 5 giây (trả về hàm dừng nếu bị ngắt) */
export function chargeUp(e: Engine, t: number, dur = 5): () => void {
  const g = e.gain(0, e.sfx, 0.4);
  const lp = e.filter("lowpass", 400, 4);
  lp.connect(g);
  e.sweep(lp.frequency, t, 300, 4000, dur);
  const o1 = e.osc("sawtooth", 70, t, dur, lp);
  o1.frequency.exponentialRampToValueAtTime(700, t + dur);
  const o2 = e.osc("sawtooth", 71, t, dur, lp);
  o2.frequency.exponentialRampToValueAtTime(712, t + dur);
  e.noiseSrc(t, dur, lp, 0.6);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.14, t + dur);
  return () => {
    const n = e.now;
    g.gain.cancelScheduledValues(n);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
    g.gain.exponentialRampToValueAtTime(0.0001, n + 0.15);
    // tiếng "xì" hụt năng lượng
    const s = e.gain(0, e.sfx);
    const o = e.osc("sawtooth", 600, n, 0.5, s);
    o.frequency.exponentialRampToValueAtTime(60, n + 0.45);
    e.env(s.gain, n, 0.08, 0.005, 0.45);
  };
}

/** Pháo xa (tháp phòng không): "bụp" nghẹt vọng lại */
export function flak(e: Engine, t: number, x?: number) {
  const g = e.gain(0, e.pan(e.sfx, x), 0.6);
  const lp = e.filter("lowpass", 900);
  lp.connect(g);
  e.noiseSrc(t, 0.12, lp);
  e.env(g.gain, t, 0.07, 0.002, 0.09);
}

/** Đám đông reo hò (thắng) */
export function cheer(e: Engine, t: number) {
  for (const x of [250, 540, 830]) {
    const g = e.gain(0, e.pan(e.sfx, x), 0.3);
    const bp = e.filter("bandpass", r(900, 1400), 0.6);
    bp.connect(g);
    e.noiseSrc(t, 3, bp, r(0.9, 1.1));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.5);
    g.gain.setValueAtTime(0.06, t + 1.8);
    g.gain.linearRampToValueAtTime(0.0001, t + 3);
  }
  for (let i = 0; i < 10; i++) crackle(e, t + 0.3 + i * 0.22, 5, 0.2, e.sfx, 0.04, 1500);
}
