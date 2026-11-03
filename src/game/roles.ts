// Vai trò đặc biệt của người xem:
//  • TRÙM NGƯỜI XEM — tặng 1 lượt quà từ BOSS_GIFT_COINS xu: vòng sau người đó điều khiển trùm (ảnh đại diện trên thân trùm).
//  • KẺ PHẢN BỘI — bình luận "đổi phe", "hail UFO"…: biến thành UFO nhỏ màu đỏ (vẫn có ảnh đại diện) bay trên đầu
//    người chơi, hồi máu cho trùm; cả phòng ưu tiên bắn hạ. Bị bắn hạ / bình luận "về phe" / tặng quà → quay về phe Trái Đất.

import type { LiveUser } from "../live/events";
import { GIFTS, WEAPON_LABEL } from "./gifts";

/** bỏ dấu, chữ thường, gộp khoảng trắng — để bắt "Đổi Phe", "doi phe", "HAIL UFO!!!" */
function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** bình luận để sang phe UFO (so khớp không dấu, chứa cụm) */
export const DEFECT_WORDS = ["doi phe", "hail ufo", "theo ufo", "phe ufo", "team ufo", "ufo muon nam", "phan boi", "gia nhap ufo", "len tau", "ufo vo dich"];
/** bình luận để quay về phe Trái Đất */
export const RETURN_WORDS = ["ve phe", "quay ve", "team trai dat", "phe trai dat", "bao ve trai dat", "hoi han"];

export function isDefect(text: string) {
  const t = ` ${norm(text)} `;
  return DEFECT_WORDS.some((w) => t.includes(` ${w} `) || t.includes(` ${w}`));
}

export function isReturn(text: string) {
  const t = ` ${norm(text)} `;
  return RETURN_WORDS.some((w) => t.includes(` ${w}`));
}

/** UFO nhỏ màu đỏ của kẻ phản bội */
export interface Traitor {
  user: LiveUser;
  x: number;
  y: number;
  /** điểm đang bay tới (lượn trong vùng người chơi) */
  tx: number;
  ty: number;
  hp: number;
  max: number;
  t0: number;
  /** lần cuối trúng đạn (nháy trắng) */
  hitT: number;
  dead: boolean;
}

/** Vẽ UFO đỏ: đĩa + vòm kính chứa ảnh đại diện, đèn nháy, tên & thanh máu */
export function drawTraitor(ctx: CanvasRenderingContext2D, tr: Traitor, avatar: CanvasImageSource, time: number, label: (s: string, x: number, y: number) => void) {
  const born = Math.min(1, (time - tr.t0) / 0.5);
  const s = 0.4 + 0.6 * born;
  const hit = time - tr.hitT < 0.12;
  ctx.save();
  ctx.translate(tr.x, tr.y + Math.sin(time * 3 + tr.t0) * 6);
  ctx.rotate(Math.sin(time * 2.2 + tr.t0) * 0.08);
  ctx.scale(s, s);
  // quầng đỏ
  const g = ctx.createRadialGradient(0, 8, 10, 0, 8, 120);
  g.addColorStop(0, "rgba(255,40,60,0.45)");
  g.addColorStop(1, "rgba(255,40,60,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 8, 120, 0, Math.PI * 2);
  ctx.fill();
  // tia đẩy dưới bụng
  ctx.fillStyle = `rgba(255,120,80,${0.35 + 0.25 * Math.sin(time * 20)})`;
  ctx.beginPath();
  ctx.moveTo(-18, 26);
  ctx.lineTo(18, 26);
  ctx.lineTo(0, 62 + Math.sin(time * 30) * 6);
  ctx.fill();
  // thân đĩa
  const body = ctx.createLinearGradient(0, -10, 0, 34);
  body.addColorStop(0, hit ? "#ffffff" : "#ff5a5a");
  body.addColorStop(0.55, hit ? "#ffd0d0" : "#c4101e");
  body.addColorStop(1, "#5a0410");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 14, 82, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffb0b0";
  ctx.lineWidth = 3;
  ctx.stroke();
  // đèn quanh vành
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + time * 2;
    const lx = Math.cos(a) * 66;
    const ly = 16 + Math.sin(a) * 12;
    if (Math.sin(a) < -0.2) continue;
    ctx.fillStyle = (i + Math.floor(time * 6)) % 2 ? "#ffe27a" : "#ff2b3a";
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // vòm kính + ảnh đại diện
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, -6, 38, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, -38, -44, 76, 76);
  ctx.fillStyle = "rgba(255,30,50,0.22)";
  ctx.fillRect(-40, -46, 80, 80);
  ctx.restore();
  ctx.strokeStyle = "#ff3344";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, -6, 39, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-14, -26, 12, 6, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // tên + thanh máu
  const y = tr.y + 58;
  label(tr.user.name, tr.x, y);
  const w = 110;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(tr.x - w / 2, y + 16, w, 9);
  ctx.fillStyle = "#ff3b4e";
  ctx.fillRect(tr.x - w / 2, y + 16, w * Math.max(0, tr.hp / tr.max), 9);
}

/** Bảng hướng dẫn: [biểu tượng, cách tương tác, tác dụng] */
export function guideRows(bossGift: number): [string, string, string][] {
  const rows: [string, string, string][] = [
    ["❤️", "Thả tim", "Bắn laser"],
    ["💬", "Bình luận", "Phóng tên lửa"],
    ["➕", "Follow", "Đẩy UFO lùi"],
    ["↗", "Chia sẻ", "Đẩy UFO lùi xa"],
  ];
  // mỗi loại vũ khí lấy 1 món tiêu biểu (rẻ nhất) để bảng gọn
  const seen = new Set<string>();
  for (const g of [...GIFTS].sort((a, b) => a.coins - b.coins)) {
    if (seen.has(g.weapon)) continue;
    seen.add(g.weapon);
    rows.push([g.icon, g.name, WEAPON_LABEL[g.weapon]]);
  }
  rows.push(["👑", `Quà từ ${bossGift} xu`, "Làm TRÙM vòng sau"]);
  rows.push(["😈", "Chat “đổi phe”", "Thành UFO đỏ"]);
  rows.push(["🌍", "Chat “về phe”", "Về phe Trái Đất"]);
  return rows;
}
