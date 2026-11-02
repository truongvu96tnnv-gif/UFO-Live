import type { BossId } from "./bosses";
import { mulberry32 } from "./math";
import type { Img } from "./sprites";

/**
 * Chuyển động & hiệu ứng động của trùm, phân tích từ video giới thiệu boss:
 *  UFO        — lơ lửng nhấp nhô, chao nghiêng; 3 luồng phản lực xanh dưới bụng chập chờn; đèn đỏ chạy quanh vành
 *  Đĩa Vàng   — đứng tại chỗ; vòng năng lượng vàng quay quanh đĩa (vệt sao chổi); tia đỏ từ viên ngọc bắn lên
 *  Tinh Thể   — bồng bềnh; lõi plasma đập sáng + tia điện; mảnh tinh thể bay vòng quanh (có trước/sau)
 *  Bạch Tuộc  — xúc tu cuộn/duỗi chậm, lệch nhịp từng chiếc (xem octopusWarp trong game.ts)
 *  Phi Thuyền Mẹ — 2 vòng con quay chéo chữ X quay quanh vòm; ánh xanh dưới bụng đập
 *  Hành Tinh  — xoay chậm; viền lửa lập loè; vành đá vụn bay quanh; dung nham phập phồng
 */

/** Nhịp lơ lửng của từng trùm: nhấp nhô (px, Hz) & chao nghiêng (rad, Hz) */
export const MOTION: Record<BossId, { bob: number; bobHz: number; roll: number; rollHz: number; spin: number }> = {
  ufo: { bob: 9, bobHz: 0.55, roll: 0.05, rollHz: 0.35, spin: 0 },
  gold: { bob: 5, bobHz: 0.4, roll: 0.02, rollHz: 0.25, spin: 0 },
  octopus: { bob: 8, bobHz: 0.38, roll: 0.03, rollHz: 0.22, spin: 0 },
  stealth: { bob: 7, bobHz: 0.45, roll: 0.06, rollHz: 0.3, spin: 0 },
  spider: { bob: 6, bobHz: 0.5, roll: 0.03, rollHz: 0.32, spin: 0 },
  crystal: { bob: 12, bobHz: 0.3, roll: 0.015, rollHz: 0.2, spin: 0 },
  mother: { bob: 5, bobHz: 0.25, roll: 0.015, rollHz: 0.18, spin: 0 },
  devourer: { bob: 8, bobHz: 0.28, roll: 0.07, rollHz: 0.12, spin: 0 },
  dragon: { bob: 12, bobHz: 0.32, roll: 0.02, rollHz: 0.2, spin: 0 },
  planet: { bob: 4, bobHz: 0.2, roll: 0, rollHz: 0, spin: 0.06 },
};

export interface FxCtx {
  t: number;
  w: number;
  h: number;
  at: (fx: number, fy: number) => [number, number];
  glows: Img[];
  alpha: number;
  danger: boolean;
}

/** Luồng phản lực / lửa phụt: dải gradient từ miệng ống, dài ngắn chập chờn */
export function jet(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, width: number, inner: string, outer: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, outer);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -width / 2);
  ctx.quadraticCurveTo(len * 0.55, -width * 0.42, len, 0);
  ctx.quadraticCurveTo(len * 0.55, width * 0.42, 0, width / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Vòng quỹ đạo quanh thân: vẽ nửa sau (front=false) trước thân, nửa trước sau thân */
function orbitArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, tilt: number, front: boolean, stroke: string, width: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** điểm trên elip quỹ đạo (góc a), kèm cờ "ở phía trước" */
function onOrbit(cx: number, cy: number, rx: number, ry: number, tilt: number, a: number): [number, number, boolean] {
  const x = Math.cos(a) * rx;
  const y = Math.sin(a) * ry;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return [cx + x * c - y * s, cy + x * s + y * c, Math.sin(a) > 0];
}

// ---------------- Đĩa Vàng: vòng năng lượng & tia ngọc ----------------

function goldRings(ctx: CanvasRenderingContext2D, k: FxCtx, front: boolean) {
  const [cx, cy] = k.at(0.5, 0.52);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [i, rx, ry, tilt, sp] of [[0, k.w * 0.6, k.h * 0.2, -0.08, 1.4], [1, k.w * 0.54, k.h * 0.26, 0.12, -1.1]] as const) {
    ctx.globalAlpha = 0.35 * k.alpha;
    orbitArc(ctx, cx, cy, rx, ry, tilt, front, "rgba(255,210,90,0.9)", 2.5);
    // vệt sao chổi chạy theo vòng
    for (let j = 0; j < 14; j++) {
      const a = k.t * sp + i * 2.1 - j * 0.06 * Math.sign(sp);
      const [x, y, f] = onOrbit(cx, cy, rx, ry, tilt, a);
      if (f !== front) continue;
      ctx.globalAlpha = (1 - j / 14) * 0.9 * k.alpha;
      const s = 34 * (1 - j / 18);
      ctx.drawImage(k.glows[0], x - s / 2, y - s / 2, s, s);
    }
  }
  ctx.restore();
}

function goldGemBeam(ctx: CanvasRenderingContext2D, k: FxCtx) {
  const [gx, gy] = k.at(0.5, 0.14);
  const p = 0.6 + 0.4 * Math.sin(k.t * 3.2);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(0, gy, 0, gy - 170);
  g.addColorStop(0, `rgba(255,60,70,${0.7 * p})`);
  g.addColorStop(1, "rgba(255,40,60,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(gx - 16, gy);
  ctx.lineTo(gx - 4, gy - 170);
  ctx.lineTo(gx + 4, gy - 170);
  ctx.lineTo(gx + 16, gy);
  ctx.fill();
  ctx.globalAlpha = p;
  ctx.drawImage(k.glows[1], gx - 40, gy - 34, 80, 68);
  ctx.restore();
}

// ---------------- UFO: phản lực xanh & đèn chạy ----------------

function ufoJets(ctx: CanvasRenderingContext2D, k: FxCtx) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  [0.33, 0.45, 0.55, 0.67].forEach((fx, i) => {
    const [x, y] = k.at(fx, 0.9);
    const len = 130 + 35 * Math.sin(k.t * 13 + i * 1.7) + 20 * Math.sin(k.t * 31 + i);
    ctx.globalAlpha = 0.9 * k.alpha;
    // quầng xanh rộng + lõi trắng hẹp như luồng phản lực trong video
    jet(ctx, x, y - 6, Math.PI / 2 + (fx - 0.5) * 0.2, len * 1.1, 46, "rgba(120,200,255,0.8)", "rgba(40,120,255,0.35)");
    jet(ctx, x, y - 6, Math.PI / 2 + (fx - 0.5) * 0.2, len * 0.8, 18, "rgba(255,255,255,1)", "rgba(150,220,255,0.8)");
    ctx.drawImage(k.glows[6], x - 34, y - 24, 68, 48);
  });
  ctx.restore();
}

function ufoChase(ctx: CanvasRenderingContext2D, k: FxCtx) {
  const [cx, cy] = k.at(0.5, 0.65);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.08 + (0.84 * ((i / n + k.t * (k.danger ? 0.9 : 0.35)) % 1)));
    const x = cx - Math.cos(a) * k.w * 0.44;
    const y = cy + Math.sin(a) * k.h * 0.12;
    ctx.globalAlpha = (0.55 + 0.45 * Math.sin(k.t * 8 + i)) * k.alpha;
    ctx.drawImage(k.glows[1], x - 16, y - 12, 32, 24);
  }
  ctx.restore();
}

// ---------------- Tinh Thể: lõi plasma, tia điện, mảnh bay vòng ----------------

const SHARDS = Array.from({ length: 12 }, (_, i) => {
  const r = mulberry32(300 + i);
  return { a: (i / 12) * Math.PI * 2 + r() * 0.3, s: 14 + r() * 16, spin: (r() - 0.5) * 3, hue: r() < 0.5 ? 0 : 1, lift: (r() - 0.5) * 30 };
});

function shard(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, hue: number, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = a;
  const g = ctx.createLinearGradient(0, -s, 0, s);
  g.addColorStop(0, "rgba(220,250,255,0.95)");
  g.addColorStop(0.5, hue ? "rgba(150,110,255,0.9)" : "rgba(90,200,255,0.9)");
  g.addColorStop(1, hue ? "rgba(90,40,200,0.9)" : "rgba(40,110,220,0.9)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.38, -s * 0.2);
  ctx.lineTo(s * 0.22, s);
  ctx.lineTo(-s * 0.3, s * 0.55);
  ctx.lineTo(-s * 0.36, -s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(0.02 * s, s * 0.7);
  ctx.stroke();
  ctx.restore();
}

function crystalShards(ctx: CanvasRenderingContext2D, k: FxCtx, front: boolean) {
  const [cx, cy] = k.at(0.5, 0.55);
  const rx = k.w * 0.62;
  const ry = k.h * 0.13;
  for (const sh of SHARDS) {
    const a = sh.a + k.t * 0.45;
    const [x, y, f] = onOrbit(cx, cy + sh.lift, rx, ry, -0.12, a);
    if (f !== front) continue;
    const depth = 0.75 + 0.25 * Math.sin(a);
    shard(ctx, x, y, sh.s * depth, k.t * sh.spin, sh.hue, (front ? 1 : 0.55) * k.alpha);
  }
}

function crystalCore(ctx: CanvasRenderingContext2D, k: FxCtx) {
  const [cx, cy] = k.at(0.5, 0.52);
  const p = 0.5 + 0.5 * Math.sin(k.t * 4);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = (0.55 + 0.4 * p) * k.alpha;
  const s = 150 + 50 * p;
  ctx.drawImage(k.glows[6], cx - s, cy - s, s * 2, s * 2);
  ctx.drawImage(k.glows[2], cx - s * 0.35, cy - s * 0.35, s * 0.7, s * 0.7);
  // tia điện chập chờn từ lõi ra
  const r = mulberry32(Math.floor(k.t * 12));
  ctx.strokeStyle = "rgba(190,240,255,0.9)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    if (r() < 0.45) continue;
    const ang = r() * Math.PI * 2;
    const len = 90 + r() * 110;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    let x = cx;
    let y = cy;
    for (let j = 1; j <= 6; j++) {
      x = cx + Math.cos(ang) * (len * j) / 6 + (r() - 0.5) * 22;
      y = cy + Math.sin(ang) * (len * j) / 6 * 0.8 + (r() - 0.5) * 22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.drawImage(k.glows[6], x - 16, y - 16, 32, 32);
  }
  ctx.restore();
}

// ---------------- Phi Thuyền Mẹ: vòng con quay chữ X ----------------

function gyroRings(ctx: CanvasRenderingContext2D, k: FxCtx, front: boolean) {
  const [cx, cy] = k.at(0.5, 0.16);
  const R = k.w * 0.2;
  ctx.save();
  for (const [base, sp] of [[0.75, 0.6], [-0.75, 0.6]] as const) {
    // vòng quay quanh trục đứng: bề ngang co giãn theo cos, nghiêng chéo tạo chữ X
    const rx = R * (0.35 + 0.65 * Math.abs(Math.cos(k.t * sp)));
    for (const [wd, col] of [[18, "rgba(32,38,48,1)"], [11, "rgba(120,130,146,1)"], [4, "rgba(220,230,245,0.9)"]] as const) {
      ctx.globalAlpha = k.alpha * (front ? 1 : 0.7);
      orbitArc(ctx, cx, cy, rx, R * 1.05, base, front, col, wd);
    }
  }
  ctx.restore();
}

function motherGlow(ctx: CanvasRenderingContext2D, k: FxCtx) {
  const [bx, by] = k.at(0.5, 0.86);
  const p = 0.5 + 0.5 * Math.sin(k.t * 2.6);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = (0.45 + 0.45 * p) * k.alpha;
  ctx.drawImage(k.glows[6], bx - 120, by - 40, 240, 110);
  ctx.drawImage(k.glows[2], bx - 40, by - 14, 80, 40);
  ctx.restore();
}

// ---------------- Hành Tinh: vành đá vụn & viền lửa ----------------

const ROCKS = Array.from({ length: 34 }, (_, i) => {
  const r = mulberry32(700 + i);
  return { a: r() * Math.PI * 2, s: 4 + r() * 10, d: 0.92 + r() * 0.25, spin: (r() - 0.5) * 4, sides: 5 + Math.floor(r() * 3) };
});

function rock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, sides: number, lit: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = `rgb(${50 + 40 * lit},${36 + 20 * lit},${30 + 10 * lit})`;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const rr = s * (0.7 + 0.3 * Math.sin(i * 2.3));
    if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = `rgba(255,140,50,${0.5 * lit})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function planetDebris(ctx: CanvasRenderingContext2D, k: FxCtx, front: boolean) {
  const [cx, cy] = k.at(0.5, 0.5);
  const R = k.w * 0.4;
  for (const r of ROCKS) {
    const a = r.a + k.t * 0.22;
    const [x, y, f] = onOrbit(cx, cy, R * 1.25 * r.d, R * 0.32 * r.d, -0.22, a);
    if (f !== front) continue;
    ctx.globalAlpha = k.alpha * (front ? 1 : 0.6);
    rock(ctx, x, y, r.s * (0.8 + 0.2 * Math.sin(a)), k.t * r.spin, r.sides, front ? 1 : 0.4);
  }
  ctx.globalAlpha = 1;
}

function planetCorona(ctx: CanvasRenderingContext2D, k: FxCtx) {
  const [cx, cy] = k.at(0.5, 0.5);
  const R = k.w * 0.39;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + k.t * 0.15;
    const f = 0.5 + 0.5 * Math.sin(k.t * 7 + i * 2.7) * Math.sin(k.t * 3.1 + i);
    ctx.globalAlpha = (0.25 + 0.45 * f) * k.alpha;
    const s = 50 + 40 * f;
    ctx.drawImage(k.glows[1], cx + Math.cos(a) * R - s / 2, cy + Math.sin(a) * R - s / 2, s, s);
  }
  ctx.restore();
}

/** Lớp vẽ TRƯỚC thân trùm (phần nằm sau lưng: nửa sau quỹ đạo, phản lực, lửa đuôi) */
export function bossUnder(ctx: CanvasRenderingContext2D, id: BossId, k: FxCtx) {
  switch (id) {
    case "ufo":
      ufoJets(ctx, k);
      break;
    case "gold":
      goldRings(ctx, k, false);
      break;
    case "crystal":
      crystalShards(ctx, k, false);
      break;
    case "mother":
      motherGlow(ctx, k);
      gyroRings(ctx, k, false);
      break;
    case "planet":
      planetDebris(ctx, k, false);
      break;
    default:
      break;
  }
}

/** Lớp vẽ SAU thân trùm (nửa trước quỹ đạo, đèn, lõi sáng) */
export function bossOver(ctx: CanvasRenderingContext2D, id: BossId, k: FxCtx) {
  switch (id) {
    case "ufo":
      ufoChase(ctx, k);
      break;
    case "gold":
      goldGemBeam(ctx, k);
      goldRings(ctx, k, true);
      break;
    case "crystal":
      crystalCore(ctx, k);
      crystalShards(ctx, k, true);
      break;
    case "mother":
      gyroRings(ctx, k, true);
      break;
    case "planet":
      planetCorona(ctx, k);
      planetDebris(ctx, k, true);
      break;
    default:
      break;
  }
}
