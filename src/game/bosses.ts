import { mulberry32 } from "./math";
import { canvas, makeSaucer, SCX, SCY, SH, SW, type Img } from "./sprites";

/**
 * Danh sách trùm. Mỗi trùm có model vẽ riêng (sprite tĩnh + lớp động vẽ mỗi khung) và 1 kỹ năng đặc trưng.
 *
 *  Trùm theo MỐC CHUỖI THẮNG (thắng liên tiếp 5 / 10 / 20 / 30… vòng thì vòng kế tiếp gặp trùm):
 *    5  → Chiến Hạm Đỏ        — pháo phản công làm choáng người bắn
 *    10 → Pháo Đài Tinh Thể   — khiên tinh thể tự hồi
 *    20 → Phi Thuyền Mẹ       — thả UFO con xuống bắt người
 *    30, 50, 75, 100… → Hành Tinh Hủy Diệt — sạc pháo hủy diệt, phải dồn sát thương để ngắt sạc
 *  Trùm NGẪU NHIÊN (xen giữa các vòng thường):
 *    Đĩa Vàng Hoàng Gia (giáp dày) · Bạch Tuộc Vũ Trụ (xúc tu bắt người) · Tàu Tàng Hình (đạn bắn trượt khi tàng hình)
 */

export type BossId = "ufo" | "gold" | "octopus" | "stealth" | "spider" | "cruiser" | "crystal" | "mother" | "planet";
export type Ability = "none" | "armor" | "grab" | "cloak" | "web" | "counter" | "shield" | "drones" | "charge";

export interface BossDef {
  id: BossId;
  name: string;
  kind: "normal" | "random" | "milestone";
  /** trùm mốc: chuỗi thắng tối thiểu để gặp */
  milestone?: number;
  /** hệ số máu & thời gian hạ so với UFO thường */
  hpMul: number;
  timeMul: number;
  /** độ mạnh hiển thị (1–5 sao) */
  stars: number;
  color: string;
  ability: Ability;
  /** mô tả kỹ năng, hiện ở thẻ giới thiệu */
  power: string;
  /** khung sprite & tâm thân (đơn vị sprite) */
  w: number;
  h: number;
  cx: number;
  cy: number;
  scale: number;
  /** vùng trúng đạn (elip quanh tâm, đơn vị sprite) & lệch tâm dọc */
  hitRx: number;
  hitRy: number;
  hitCy: number;
  /** bụng — nơi bật tia hút / thả UFO con (đơn vị sprite, so với tâm) */
  bellyY: number;
}

export const BOSSES: Record<BossId, BossDef> = {
  ufo: {
    id: "ufo", name: "UFO Xâm Lược", kind: "normal", hpMul: 1, timeMul: 1, stars: 1, color: "#9dff7a", ability: "none",
    power: "", w: SW, h: SH, cx: SCX, cy: SCY, scale: 0.74, hitRx: 300, hitRy: 50, hitCy: 0, bellyY: 58,
  },
  gold: {
    id: "gold", name: "Đĩa Vàng Hoàng Gia", kind: "random", hpMul: 2.2, timeMul: 1.15, stars: 2, color: "#ffd55a", ability: "armor",
    power: "Giáp vàng dày gấp đôi — cả phòng phải dồn hỏa lực!", w: SW, h: SH, cx: SCX, cy: SCY, scale: 0.82, hitRx: 300, hitRy: 55, hitCy: -10, bellyY: 58,
  },
  octopus: {
    id: "octopus", name: "Bạch Tuộc Vũ Trụ", kind: "random", hpMul: 1.8, timeMul: 1.1, stars: 3, color: "#d58bff", ability: "grab",
    power: "Xúc tu tóm người xem — dồn sát thương để giải cứu!", w: 700, h: 380, cx: 350, cy: 210, scale: 0.8, hitRx: 280, hitRy: 110, hitCy: -50, bellyY: 70,
  },
  stealth: {
    id: "stealth", name: "Tàu Tàng Hình Bóng Đêm", kind: "random", hpMul: 1.6, timeMul: 0.9, stars: 3, color: "#5ad1ff", ability: "cloak",
    power: "Tàng hình từng đợt — đạn bắn trượt khi tàu biến mất!", w: 780, h: 260, cx: 390, cy: 120, scale: 0.78, hitRx: 330, hitRy: 50, hitCy: 10, bellyY: 70,
  },
  spider: {
    id: "spider", name: "Nhện Vũ Trụ", kind: "random", hpMul: 2, timeMul: 1.1, stars: 3, color: "#7dff4a", ability: "web",
    power: "Giăng lưới tơ: tim (laser) dính lưới chỉ gây 30% — bình luận & quà mới xé được lưới!", w: SW, h: SH, cx: SCX, cy: SCY, scale: 0.8, hitRx: 280, hitRy: 70, hitCy: 0, bellyY: 70,
  },
  cruiser: {
    id: "cruiser", name: "Chiến Hạm Đỏ", kind: "milestone", milestone: 5, hpMul: 2, timeMul: 1.3, stars: 4, color: "#ff5a6e", ability: "counter",
    power: "Pháo phản công bắn choáng người xem — sát thương của họ giảm một nửa!", w: 920, h: 300, cx: 460, cy: 150, scale: 0.84, hitRx: 400, hitRy: 55, hitCy: 5, bellyY: 55,
  },
  crystal: {
    id: "crystal", name: "Pháo Đài Tinh Thể", kind: "milestone", milestone: 10, hpMul: 2.4, timeMul: 1.4, stars: 4, color: "#7ff0ff", ability: "shield",
    power: "Khiên tinh thể tự hồi — phá khiên rồi mới đánh được thân!", w: 620, h: 560, cx: 310, cy: 280, scale: 0.72, hitRx: 170, hitRy: 210, hitCy: 0, bellyY: 250,
  },
  mother: {
    id: "mother", name: "Phi Thuyền Mẹ", kind: "milestone", milestone: 20, hpMul: 2.8, timeMul: 1.5, stars: 5, color: "#ffb15a", ability: "drones",
    power: "Thả UFO con xuống bắt người — bắn rơi chúng trước khi chạm phố!", w: 1100, h: 440, cx: 550, cy: 250, scale: 0.86, hitRx: 500, hitRy: 90, hitCy: -10, bellyY: 100,
  },
  planet: {
    id: "planet", name: "Hành Tinh Hủy Diệt", kind: "milestone", milestone: 30, hpMul: 3.2, timeMul: 1.6, stars: 5, color: "#ff3b3b", ability: "charge",
    power: "Mắt hủy diệt sạc năng lượng — dồn sát thương để ngắt sạc, không thì bị đẩy sát mặt đất!", w: 720, h: 560, cx: 360, cy: 280, scale: 0.8, hitRx: 210, hitRy: 210, hitCy: 0, bellyY: 225,
  },
};

export const RANDOM_BOSSES: BossId[] = ["gold", "octopus", "stealth", "spider"];

/** Mốc chuỗi thắng: 5, 10, 20, 30, 50, rồi cứ +25 (75, 100, 125…) */
export function isMilestone(streak: number) {
  return [5, 10, 20, 30, 50].includes(streak) || (streak > 50 && streak % 25 === 0);
}

export function nextMilestone(streak: number) {
  let m = streak + 1;
  while (!isMilestone(m)) m++;
  return m;
}

export function milestoneBoss(streak: number): BossId {
  if (streak >= 30) return "planet";
  if (streak >= 20) return "mother";
  if (streak >= 10) return "crystal";
  return "cruiser";
}

// ======================= sprite tĩnh =======================

export function makeBossSprite(id: BossId): Img {
  switch (id) {
    case "ufo":
      return makeSaucer();
    case "gold":
      return makeGoldSaucer();
    case "octopus":
      return makeOctopus();
    case "stealth":
      return makeStealth();
    case "spider":
      return makeSaucer("rgba(90,255,80,0.22)");
    case "cruiser":
      return makeCruiser();
    case "crystal":
      return makeCrystal();
    case "mother":
      return makeMothership();
    case "planet":
      return makePlanet();
  }
}

/** Đĩa vàng: thân đĩa mạ vàng + vương miện gai nhọn quanh vòm + viên ngọc đỏ trên đỉnh */
function makeGoldSaucer(): Img {
  const c = makeSaucer("rgba(255,196,70,0.5)");
  const g = c.getContext("2d")!;
  const top = SCY - 98;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.08 + (0.84 * i) / 8);
    const x = SCX - Math.cos(a) * 150;
    const y = SCY - 26 - Math.sin(a) * 74;
    const tall = i % 2 ? 26 : 40;
    const grad = g.createLinearGradient(x, y - tall, x, y);
    grad.addColorStop(0, "#fff3b0");
    grad.addColorStop(1, "#b07a10");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - 9, y + 4);
    g.lineTo(x, y - tall);
    g.lineTo(x + 9, y + 4);
    g.fill();
  }
  const gem = g.createRadialGradient(SCX - 4, top - 18, 2, SCX, top - 12, 18);
  gem.addColorStop(0, "#ffd0d0");
  gem.addColorStop(0.4, "#ff3355");
  gem.addColorStop(1, "#6a0010");
  g.fillStyle = gem;
  g.beginPath();
  g.moveTo(SCX, top - 34);
  g.lineTo(SCX + 16, top - 12);
  g.lineTo(SCX, top + 6);
  g.lineTo(SCX - 16, top - 12);
  g.fill();
  return c;
}

/** Bạch tuộc: đầu hình vòm thịt tím lốm đốm, hai mắt vàng con ngươi dọc, ngồi trên vành đĩa kim loại tím */
function makeOctopus(): Img {
  const W = 700, H = 380, cx = 350, cy = 210;
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(31);
  // vành đĩa
  const ring = g.createLinearGradient(0, cy - 30, 0, cy + 60);
  ring.addColorStop(0, "#9b6cc9");
  ring.addColorStop(0.5, "#4a2470");
  ring.addColorStop(1, "#160a24");
  g.fillStyle = ring;
  g.beginPath();
  g.ellipse(cx, cy + 20, 300, 50, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(230,190,255,0.5)";
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(cx, cy + 18, 298, 48, 0, Math.PI * 1.05, Math.PI * 1.95);
  g.stroke();
  // đầu
  const head = g.createRadialGradient(cx - 50, cy - 140, 20, cx, cy - 60, 200);
  head.addColorStop(0, "#f2a6ff");
  head.addColorStop(0.45, "#b04fd0");
  head.addColorStop(1, "#4b1466");
  g.fillStyle = head;
  g.beginPath();
  g.ellipse(cx, cy - 40, 175, 165, 0, Math.PI, 0);
  g.bezierCurveTo(cx + 175, cy + 10, cx - 175, cy + 10, cx - 175, cy - 40);
  g.fill();
  g.save();
  g.clip();
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(80,10,110,${0.25 + rnd() * 0.3})`;
    g.beginPath();
    g.ellipse(cx + (rnd() - 0.5) * 320, cy - 40 - rnd() * 150, 6 + rnd() * 16, 5 + rnd() * 12, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.beginPath();
  g.ellipse(cx - 70, cy - 150, 46, 18, -0.5, 0, Math.PI * 2);
  g.fill();
  // mắt
  for (const s of [-1, 1]) {
    const ex = cx + s * 66;
    const ey = cy - 55;
    g.fillStyle = "#2a0838";
    g.beginPath();
    g.ellipse(ex, ey, 44, 34, s * 0.25, 0, Math.PI * 2);
    g.fill();
    const eye = g.createRadialGradient(ex, ey, 2, ex, ey, 34);
    eye.addColorStop(0, "#fff7a0");
    eye.addColorStop(0.6, "#ffcc22");
    eye.addColorStop(1, "#b36b00");
    g.fillStyle = eye;
    g.beginPath();
    g.ellipse(ex, ey, 36, 27, s * 0.25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#14000a";
    g.beginPath();
    g.ellipse(ex, ey, 6, 23, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.beginPath();
    g.arc(ex - 12, ey - 10, 5, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Tàu tàng hình: cánh bay hình chữ V đen nhám, mép trước viền neon xanh, đuôi răng cưa, buồng lái khe đỏ */
function makeStealth(): Img {
  const W = 780, H = 260, cx = 390;
  const [c, g] = canvas(W, H);
  const pts: [number, number][] = [[cx, 36], [760, 150], [650, 190], [560, 160], [470, 205], [cx, 172], [310, 205], [220, 160], [130, 190], [20, 150]];
  const body = g.createLinearGradient(0, 36, 0, 205);
  body.addColorStop(0, "#3a4252");
  body.addColorStop(0.4, "#161b25");
  body.addColorStop(1, "#05070b");
  g.fillStyle = body;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  // mặt cắt đa giác
  g.strokeStyle = "rgba(140,160,190,0.22)";
  g.lineWidth = 1.5;
  for (const [x, y] of pts.slice(2, -1)) {
    g.beginPath();
    g.moveTo(cx, 60);
    g.lineTo(x, y);
    g.stroke();
  }
  g.fillStyle = "rgba(255,255,255,0.05)";
  g.beginPath();
  g.moveTo(cx, 36);
  g.lineTo(760, 150);
  g.lineTo(cx, 110);
  g.lineTo(20, 150);
  g.closePath();
  g.fill();
  // viền neon mép trước
  g.strokeStyle = "rgba(90,230,255,0.95)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(20, 150);
  g.lineTo(cx, 36);
  g.lineTo(760, 150);
  g.stroke();
  g.strokeStyle = "rgba(90,230,255,0.25)";
  g.lineWidth = 10;
  g.stroke();
  // buồng lái & cửa hút khí
  g.fillStyle = "#ff2a4a";
  g.beginPath();
  g.ellipse(cx, 92, 34, 7, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,42,74,0.3)";
  g.beginPath();
  g.ellipse(cx, 92, 60, 16, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#020305";
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * 60, 120);
    g.lineTo(cx + s * 130, 132);
    g.lineTo(cx + s * 125, 142);
    g.lineTo(cx + s * 62, 132);
    g.fill();
  }
  return c;
}

/** Chiến hạm đỏ: thân dài bọc giáp, sọc đỏ, tháp chỉ huy, 4 tháp pháo nòng đôi, 3 ống phụt ở đuôi */
function makeCruiser(): Img {
  const W = 920, H = 300;
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(77);
  const hull = g.createLinearGradient(0, 105, 0, 205);
  hull.addColorStop(0, "#8a909c");
  hull.addColorStop(0.35, "#4a4f5a");
  hull.addColorStop(0.7, "#2b1418");
  hull.addColorStop(1, "#120709");
  g.fillStyle = hull;
  g.beginPath();
  g.moveTo(60, 118);
  g.lineTo(700, 108);
  g.lineTo(890, 152);
  g.lineTo(700, 205);
  g.lineTo(90, 205);
  g.lineTo(55, 182);
  g.closePath();
  g.fill();
  // tấm giáp
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.lineWidth = 1.5;
  for (let x = 120; x < 700; x += 46 + rnd() * 20) {
    g.beginPath();
    g.moveTo(x, 112);
    g.lineTo(x - 10, 204);
    g.stroke();
  }
  // sọc đỏ & dải cửa sổ
  g.fillStyle = "#d61f3a";
  g.beginPath();
  g.moveTo(70, 160);
  g.lineTo(820, 158);
  g.lineTo(840, 166);
  g.lineTo(80, 170);
  g.fill();
  for (let x = 120; x < 760; x += 14) {
    if (rnd() < 0.7) {
      g.fillStyle = `rgba(255,${200 + rnd() * 50},120,0.9)`;
      g.fillRect(x, 140, 6, 4);
    }
  }
  // boong trên
  g.fillStyle = "#3d424c";
  g.beginPath();
  g.moveTo(180, 112);
  g.lineTo(210, 84);
  g.lineTo(610, 82);
  g.lineTo(650, 110);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(220,230,250,0.4)";
  g.beginPath();
  g.moveTo(210, 84);
  g.lineTo(610, 82);
  g.stroke();
  // tháp chỉ huy
  g.fillStyle = "#2e323a";
  g.fillRect(420, 40, 84, 44);
  g.fillStyle = "#7ff0ff";
  for (let i = 0; i < 5; i++) g.fillRect(428 + i * 15, 52, 9, 6);
  g.fillStyle = "#1c1f25";
  g.fillRect(458, 6, 4, 36);
  g.fillRect(446, 16, 28, 3);
  // tháp pháo
  for (const tx of [260, 350, 570, 650]) {
    const ty = tx > 500 ? 88 : 90;
    g.fillStyle = "#23262d";
    g.fillRect(tx + 8, ty - 22, 46, 5);
    g.fillRect(tx + 8, ty - 13, 46, 5);
    const dome = g.createLinearGradient(0, ty - 30, 0, ty);
    dome.addColorStop(0, "#9aa0ab");
    dome.addColorStop(1, "#3a3e47");
    g.fillStyle = dome;
    g.beginPath();
    g.ellipse(tx, ty - 8, 26, 20, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = "#d61f3a";
    g.fillRect(tx - 18, ty - 10, 36, 3);
  }
  // ống phụt đuôi
  for (const ey of [132, 160, 188]) {
    g.fillStyle = "#15171c";
    g.beginPath();
    g.ellipse(55, ey, 12, 14, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#5a5f6b";
    g.lineWidth = 3;
    g.stroke();
  }
  return c;
}

function hexPrism(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rot: number, light: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const pts: [number, number][] = [[0, -h / 2], [w / 2, -h / 4], [w / 2, h / 4], [0, h / 2], [-w / 2, h / 4], [-w / 2, -h / 4]];
  const grad = g.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, `rgba(190,255,255,${0.95 * light})`);
  grad.addColorStop(0.45, `rgba(90,200,255,${0.9 * light})`);
  grad.addColorStop(1, `rgba(120,60,255,${0.95 * light})`);
  g.fillStyle = grad;
  g.beginPath();
  pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.closePath();
  g.fill();
  // mặt trái sáng, mặt phải tối
  g.fillStyle = "rgba(255,255,255,0.22)";
  g.beginPath();
  g.moveTo(0, -h / 2);
  g.lineTo(-w / 2, -h / 4);
  g.lineTo(-w / 2, h / 4);
  g.lineTo(0, h / 2);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(20,0,60,0.25)";
  g.beginPath();
  g.moveTo(0, -h / 2);
  g.lineTo(w / 2, -h / 4);
  g.lineTo(w / 2, h / 4);
  g.lineTo(0, h / 2);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.7)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -h / 2);
  g.lineTo(0, h / 2);
  g.stroke();
  g.restore();
}

/** Pháo đài tinh thể: lăng trụ lục giác lớn ở giữa, 4 tinh thể con chĩa ra, lõi sáng bên trong */
function makeCrystal(): Img {
  const W = 620, H = 560, cx = 310, cy = 280;
  const [c, g] = canvas(W, H);
  const core = g.createRadialGradient(cx, cy, 10, cx, cy, 260);
  core.addColorStop(0, "rgba(160,240,255,0.5)");
  core.addColorStop(1, "rgba(120,60,255,0)");
  g.fillStyle = core;
  g.fillRect(0, 0, W, H);
  hexPrism(g, cx - 150, cy + 40, 80, 230, -0.55, 0.85);
  hexPrism(g, cx + 150, cy + 40, 80, 230, 0.55, 0.85);
  hexPrism(g, cx - 120, cy - 90, 56, 150, -0.9, 0.8);
  hexPrism(g, cx + 120, cy - 90, 56, 150, 0.9, 0.8);
  hexPrism(g, cx, cy, 170, 500, 0, 1);
  // vết nứt sáng
  g.strokeStyle = "rgba(255,255,255,0.55)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(cx - 40, cy - 120);
  g.lineTo(cx - 10, cy - 60);
  g.lineTo(cx - 30, cy + 10);
  g.moveTo(cx + 30, cy + 60);
  g.lineTo(cx + 10, cy + 140);
  g.stroke();
  return c;
}

/** Phi thuyền mẹ: đĩa khổng lồ 3 tầng, hàng trăm ô cửa, tháp nhọn đèn đỏ, khoang chứa phát sáng dưới bụng */
function makeMothership(): Img {
  const W = 1100, H = 440, cx = 550, cy = 250;
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(404);
  const under = g.createLinearGradient(0, cy, 0, cy + 130);
  under.addColorStop(0, "#3a4050");
  under.addColorStop(1, "#07080b");
  g.fillStyle = under;
  g.beginPath();
  g.ellipse(cx, cy + 40, 500, 92, 0, 0, Math.PI * 2);
  g.fill();
  // khoang chứa UFO con
  for (let i = -2; i <= 2; i++) {
    const x = cx + i * 150;
    const y = cy + 92 - Math.abs(i) * 14;
    g.fillStyle = "#120a04";
    g.fillRect(x - 40, y - 12, 80, 22);
    const bay = g.createLinearGradient(0, y - 10, 0, y + 10);
    bay.addColorStop(0, "rgba(255,170,80,0.9)");
    bay.addColorStop(1, "rgba(255,120,40,0.3)");
    g.fillStyle = bay;
    g.fillRect(x - 34, y - 7, 68, 13);
  }
  const disc = g.createLinearGradient(0, cy - 80, 0, cy + 80);
  disc.addColorStop(0, "#a8b0bd");
  disc.addColorStop(0.4, "#58606c");
  disc.addColorStop(0.7, "#2a2f38");
  disc.addColorStop(1, "#0b0d11");
  g.save();
  g.fillStyle = disc;
  g.beginPath();
  g.ellipse(cx, cy, 540, 80, 0, 0, Math.PI * 2);
  g.fill();
  g.clip();
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 540 * 0.5, cy + Math.sin(a) * 80 * 0.5);
    g.lineTo(cx + Math.cos(a) * 540, cy + Math.sin(a) * 80);
    g.stroke();
  }
  for (const s of [0.5, 0.72, 0.9]) {
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(cx, cy, 540 * s, 80 * s, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  // ô cửa quanh mép
  for (let i = 0; i < 140; i++) {
    const a = Math.PI * (0.03 + 0.94 * (i / 139));
    const x = cx - Math.cos(a) * 520;
    const y = cy + 8 + Math.sin(a) * 60;
    if (rnd() < 0.75) {
      g.fillStyle = rnd() < 0.8 ? "rgba(255,210,140,0.95)" : "rgba(140,230,255,0.95)";
      g.fillRect(x - 3, y - 2, 6, 4);
    }
  }
  // tầng 2
  const tier = g.createLinearGradient(0, cy - 110, 0, cy - 30);
  tier.addColorStop(0, "#8d95a2");
  tier.addColorStop(1, "#2c313a");
  g.fillStyle = tier;
  g.beginPath();
  g.ellipse(cx, cy - 40, 330, 50, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(cx - 330, cy - 80, 660, 40);
  g.beginPath();
  g.ellipse(cx, cy - 80, 330, 50, 0, 0, Math.PI * 2);
  g.fillStyle = "#6c7480";
  g.fill();
  for (let i = 0; i < 60; i++) {
    const x = cx - 320 + i * 10.8;
    if (rnd() < 0.6) {
      g.fillStyle = "rgba(255,220,150,0.9)";
      g.fillRect(x, cy - 62 + (rnd() < 0.5 ? 0 : 10), 5, 4);
    }
  }
  // tháp nhọn
  for (const [tx, th] of [[-220, 120], [220, 120], [-110, 90], [110, 90]] as const) {
    g.fillStyle = "#3a4049";
    g.beginPath();
    g.moveTo(cx + tx - 14, cy - 90);
    g.lineTo(cx + tx, cy - 90 - th);
    g.lineTo(cx + tx + 14, cy - 90);
    g.fill();
  }
  // vòm kính chỉ huy
  const dome = g.createRadialGradient(cx - 60, cy - 200, 10, cx, cy - 130, 200);
  dome.addColorStop(0, "rgba(200,240,255,0.95)");
  dome.addColorStop(0.5, "rgba(70,150,220,0.85)");
  dome.addColorStop(1, "rgba(20,40,90,0.9)");
  g.fillStyle = dome;
  g.beginPath();
  g.ellipse(cx, cy - 100, 180, 120, 0, Math.PI, 0);
  g.fill();
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,230,160,${0.4 + rnd() * 0.5})`;
    g.fillRect(cx - 140 + rnd() * 280, cy - 190 + rnd() * 80, 3, 3);
  }
  return c;
}

/** Hành tinh hủy diệt: khối cầu đá–thép nứt dung nham, vành đai nghiêng 2 lớp, hốc mắt khổng lồ ở giữa (mắt vẽ động) */
function makePlanet(): Img {
  const W = 720, H = 560, cx = 360, cy = 280, R = 215;
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(666);
  const ring = (front: boolean) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.22);
    for (const [rx, ry, w, col] of [[340, 74, 16, "rgba(190,120,80,0.75)"], [312, 66, 8, "rgba(255,190,120,0.6)"], [290, 60, 4, "rgba(120,70,50,0.8)"]] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      g.stroke();
    }
    g.restore();
  };
  ring(false);
  const sph = g.createRadialGradient(cx - 80, cy - 90, 20, cx, cy, R);
  sph.addColorStop(0, "#8a6250");
  sph.addColorStop(0.5, "#3e2a22");
  sph.addColorStop(1, "#0c0706");
  g.save();
  g.fillStyle = sph;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.clip();
  // mảng đá & tấm thép vá
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rnd() < 0.5 ? "rgba(255,230,210,0.06)" : "rgba(0,0,0,0.22)";
    g.beginPath();
    g.ellipse(cx - R + rnd() * R * 2, cy - R + rnd() * R * 2, 14 + rnd() * 40, 8 + rnd() * 24, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // vết nứt dung nham
  for (let k = 0; k < 9; k++) {
    let x = cx + (rnd() - 0.5) * R * 1.6;
    let y = cy + (rnd() - 0.5) * R * 1.6;
    const path: [number, number][] = [[x, y]];
    for (let j = 0; j < 6; j++) {
      x += (rnd() - 0.5) * 70;
      y += (rnd() - 0.3) * 50;
      path.push([x, y]);
    }
    for (const [w, col] of [[9, "rgba(255,90,20,0.35)"], [3, "rgba(255,170,60,0.95)"], [1.2, "rgba(255,240,180,1)"]] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      path.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.stroke();
    }
  }
  const shade = g.createRadialGradient(cx + 130, cy + 140, 20, cx + 130, cy + 140, 300);
  shade.addColorStop(0, "rgba(0,0,0,0.6)");
  shade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  // hốc mắt: vành thép có đinh tán
  const ex = cx + PLANET_EYE.x, ey = cy + PLANET_EYE.y;
  g.fillStyle = "#14090a";
  g.beginPath();
  g.ellipse(ex, ey, 92, 62, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#7a808c";
  g.lineWidth = 10;
  g.stroke();
  g.fillStyle = "#c9ced8";
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.beginPath();
    g.arc(ex + Math.cos(a) * 92, ey + Math.sin(a) * 62, 3.5, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  ring(true);
  g.strokeStyle = "rgba(255,90,40,0.3)";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(cx, cy, R - 2, 0, Math.PI * 2);
  g.stroke();
  return c;
}

/** Hốc mắt / nòng pháo của Hành Tinh Hủy Diệt (đơn vị sprite, so với tâm) */
export const PLANET_EYE = { x: 0, y: 10 };

// ======================= art vẽ tay (bộ asset) =======================
// Ảnh trùm tách nền từ art-source/bosses-sheet.webp (xem tools/cut_bosses.py). Khi ảnh chưa tải xong
// (hoặc lỗi) game tự dùng model vẽ bằng code ở trên.
import artCruiser from "../assets/bosses/cruiser.webp";
import artCrystal from "../assets/bosses/crystal.webp";
import artGold from "../assets/bosses/gold.webp";
import artMother from "../assets/bosses/mother.webp";
import artOctopus from "../assets/bosses/octopus.webp";
import artPlanet from "../assets/bosses/planet.webp";
import artStealth from "../assets/bosses/stealth.webp";
import artSpider from "../assets/bosses/spider.webp";
import artUfo from "../assets/bosses/ufo.webp";

export interface BossArt {
  url: string;
  /** bề rộng hiển thị (px sân khấu) */
  width: number;
  /** tâm thân theo tỉ lệ ảnh (0..1) */
  cx: number;
  cy: number;
  /** vùng trúng đạn & bụng (px sân khấu, so với tâm) */
  hitRx: number;
  hitRy: number;
  hitCy: number;
  belly: number;
}

export const BOSS_ART: Record<BossId, BossArt> = {
  ufo: { url: artUfo, width: 500, cx: 0.5, cy: 0.5, hitRx: 225, hitRy: 70, hitCy: -5, belly: 95 },
  gold: { url: artGold, width: 560, cx: 0.5, cy: 0.52, hitRx: 240, hitRy: 85, hitCy: 0, belly: 95 },
  octopus: { url: artOctopus, width: 500, cx: 0.5, cy: 0.42, hitRx: 210, hitRy: 120, hitCy: -40, belly: 45 },
  stealth: { url: artStealth, width: 660, cx: 0.5, cy: 0.55, hitRx: 290, hitRy: 55, hitCy: 0, belly: 60 },
  spider: { url: artSpider, width: 470, cx: 0.495, cy: 0.43, hitRx: 200, hitRy: 95, hitCy: -15, belly: 130 },
  cruiser: { url: artCruiser, width: 780, cx: 0.5, cy: 0.52, hitRx: 340, hitRy: 85, hitCy: 0, belly: 100 },
  crystal: { url: artCrystal, width: 420, cx: 0.5, cy: 0.5, hitRx: 160, hitRy: 190, hitCy: 0, belly: 215 },
  mother: { url: artMother, width: 840, cx: 0.5, cy: 0.5, hitRx: 380, hitRy: 100, hitCy: -15, belly: 200 },
  planet: { url: artPlanet, width: 460, cx: 0.505, cy: 0.51, hitRx: 175, hitRy: 175, hitCy: 0, belly: 190 },
};

// ======================= bộ chuyển động (sprite sheet theo khung) =======================
// Nhập bằng: tools/import_boss_anim.py <thư-mục-bộ-chuyển-động> <boss-id>. Boss có bộ chuyển động thì game dùng nó
// thay cho art tĩnh; boss chưa có thì vẫn dùng art tĩnh + hiệu ứng code như cũ.
import type { AnimMeta } from "./anim";
import octopusAnimMeta from "../assets/bosses/octopus-anim.json";
import octopusAnimUrl from "../assets/bosses/octopus-anim.webp";

export interface BossAnimDef {
  url: string;
  meta: AnimMeta;
  /** bề rộng thân hiển thị trên sân khấu (px) */
  bodyW: number;
  /** vùng trúng đạn: tỉ lệ cao/rộng của thân & lệch tâm dọc (px sân khấu) */
  hitAspect: number;
  hitCy: number;
}

export const BOSS_ANIM: Partial<Record<BossId, BossAnimDef>> = {
  octopus: { url: octopusAnimUrl, meta: octopusAnimMeta as AnimMeta, bodyW: 400, hitAspect: 0.62, hitCy: -20 },
};
