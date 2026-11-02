import type { BossId } from "./bosses";
import { clamp, mulberry32 } from "./math";
import type { Img } from "./sprites";
import { GROUND_Y, H, W } from "./stage";

/**
 * Cảnh "hạ đất" (cả phòng thua) riêng từng boss: số phận người xem, hiệu ứng thành phố / màn hình,
 * cách boss rời đi, chữ trên màn & âm thanh. Kéo dài như pha thua cũ (~9 s).
 */

export type Fate = "abduct" | "pixel" | "fall" | "gold" | "swept" | "vanish" | "cocoon" | "swallow" | "crystal" | "carried" | "fling" | "blown";
export type CityFx = "none" | "scan" | "blackout" | "goldrain" | "ink" | "glitch" | "web" | "tilt" | "crystal" | "flag" | "lava" | "cracks";
export type Exit = "flyup" | "stay" | "vanish" | "perch";

export interface DefeatDef {
  fate: Fate;
  city: CityFx;
  exit: Exit;
  /** bật tia hút như cảnh bắt cóc cổ điển */
  beam: boolean;
  title1: string;
  title2: string;
  color: string;
  /** dòng phụ, {n} = số người */
  sub: string;
  revenge: string;
  /** tiêu đề màn nghỉ khi mọi người được thả về */
  free: string;
}

export const DEFEATS: Record<BossId, DefeatDef> = {
  ufo: { fate: "abduct", city: "none", exit: "flyup", beam: true, title1: "CẢ LIVE ĐÃ BỊ", title2: "BẮT CÓC! 👽", color: "#9dff7a", sub: "{n} người dân đã bị đưa lên phi thuyền", revenge: "Thả tim để phục thù ở vòng sau!", free: "MỌI NGƯỜI ĐÃ ĐƯỢC THẢ VỀ" },
  ufo2: { fate: "pixel", city: "scan", exit: "flyup", beam: false, title1: "CẢ LIVE ĐÃ BỊ", title2: "DỊCH CHUYỂN! ⚡", color: "#5ad1ff", sub: "Lưới quét đã dịch chuyển {n} người lên tàu", revenge: "Thả tim để kéo mọi người về!", free: "MỌI NGƯỜI ĐÃ ĐƯỢC DỊCH CHUYỂN VỀ" },
  ufo3: { fate: "fall", city: "blackout", exit: "flyup", beam: false, title1: "THÀNH PHỐ", title2: "MẤT ĐIỆN! 🔌", color: "#7ff0ff", sub: "Xung EMP làm {n} người bất tỉnh", revenge: "Thả tim để bật lại điện!", free: "ĐIỆN ĐÃ CÓ LẠI — MỌI NGƯỜI TỈNH DẬY" },
  gold: { fate: "gold", city: "goldrain", exit: "stay", beam: false, title1: "CẢ LIVE BỊ", title2: "HOÁ VÀNG! 👑", color: "#ffd55a", sub: "{n} người thành tượng vàng trưng bày", revenge: "Thả tim để phá lớp vàng!", free: "LỚP VÀNG ĐÃ VỠ — MỌI NGƯỜI TỰ DO" },
  octopus: { fate: "swept", city: "ink", exit: "stay", beam: false, title1: "CẢ LIVE BỊ", title2: "BẠCH TUỘC CUỐN! 🐙", color: "#d58bff", sub: "{n} người bị cuốn đi trong làn mực tím", revenge: "Thả tim để giành lại mọi người!", free: "MỰC ĐÃ TAN — MỌI NGƯỜI TRỞ VỀ" },
  stealth: { fate: "vanish", city: "glitch", exit: "vanish", beam: false, title1: "CẢ LIVE", title2: "BIẾN MẤT… 👻", color: "#5ad1ff", sub: "{n} người biến mất không dấu vết", revenge: "Thả tim để dò tìm mọi người!", free: "TÍN HIỆU ĐÃ ỔN — MỌI NGƯỜI XUẤT HIỆN" },
  spider: { fate: "cocoon", city: "web", exit: "stay", beam: false, title1: "CẢ LIVE BỊ", title2: "CUỘN KÉN! 🕸", color: "#7dff4a", sub: "{n} người bị treo lủng lẳng trong kén tơ", revenge: "Thả tim để cắt kén!", free: "KÉN ĐÃ BỊ CẮT — MỌI NGƯỜI THOÁT RA" },
  devourer: { fate: "swallow", city: "tilt", exit: "stay", beam: false, title1: "THÀNH PHỐ BỊ", title2: "NUỐT CHỬNG! 🌀", color: "#ff9a3d", sub: "{n} người bị hút vào hố đen", revenge: "Thả tim để bắt nó nhả ra!", free: "QUÁI ĐÃ Ợ RA — MỌI NGƯỜI TRỞ VỀ" },
  crystal: { fate: "crystal", city: "crystal", exit: "stay", beam: false, title1: "CẢ LIVE BỊ", title2: "HOÁ PHA LÊ! 💎", color: "#7ff0ff", sub: "{n} người đóng băng trong pha lê", revenge: "Thả tim để phá băng!", free: "PHA LÊ ĐÃ VỠ — MỌI NGƯỜI TAN BĂNG" },
  mother: { fate: "carried", city: "flag", exit: "stay", beam: false, title1: "TRÁI ĐẤT BỊ", title2: "CHIẾM ĐÓNG! 🛸", color: "#ffb15a", sub: "UFO con đã chở {n} người đi", revenge: "Thả tim để giành lại Trái Đất!", free: "CỜ ĐÃ BỊ GIẬT XUỐNG — MỌI NGƯỜI TRỞ VỀ" },
  planet: { fate: "fling", city: "lava", exit: "stay", beam: false, title1: "THÀNH PHỐ BỊ", title2: "THIÊU RỤI! 🌋", color: "#ff6a3b", sub: "Mặt đất nứt toác, {n} người bị hất văng", revenge: "Thả tim để dập lửa!", free: "DUNG NHAM ĐÃ NGUỘI — MỌI NGƯỜI TRỞ VỀ" },
  dragon: { fate: "blown", city: "cracks", exit: "perch", beam: false, title1: "RỒNG ĐÃ", title2: "THỐNG TRỊ TRÁI ĐẤT! 🐉", color: "#b98cff", sub: "Hơi thở hư không thổi bay {n} người", revenge: "Thả tim để lật đổ rồng!", free: "VẾT NỨT ĐÃ LIỀN — MỌI NGƯỜI TRỞ VỀ" },
};

/** thời lượng hoạt cảnh số phận (giây) */
export const FATE_DUR: Record<Fate, number> = {
  abduct: 0.95,
  pixel: 1,
  fall: 1.5,
  gold: 0.6,
  swept: 1.3,
  vanish: 0.6,
  cocoon: 0.8,
  swallow: 1.4,
  crystal: 0.6,
  carried: 2.6,
  fling: 1.7,
  blown: 1.3,
};

/** số phận này giữ người lại trên màn (tượng, kén, pha lê, bất tỉnh) thay vì mang đi */
export const FATE_STAYS: Partial<Record<Fate, boolean>> = { gold: true, cocoon: true, crystal: true };

export interface Env {
  t: number; // giây kể từ lúc thua
  time: number; // đồng hồ game
  ux: number;
  uy: number;
  glows: Img[];
  /** tâm miệng / điểm phát (vd miệng hố đen) */
  mx: number;
  my: number;
}

const seeded = (n: number, seed: number) => {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => [r(), r(), r(), r()] as const);
};
const COINS = seeded(70, 11);
const SPIKES = seeded(16, 22);
const CRACKS = seeded(9, 33);
const INK = seeded(14, 44);
const GLASS = seeded(14, 55);

// ======================= lớp thế giới (sau nền, trước người xem) =======================

export function drawCity(ctx: CanvasRenderingContext2D, fx: CityFx, e: Env) {
  const t = e.t;
  switch (fx) {
    case "scan": {
      // lưới laser xanh quét từ trên xuống, lặp 2 lần
      const u = ((t - 0.6) / 1.6) % 1;
      if (t < 0.6 || t > 4) return;
      const y = 900 + u * 700;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(0, y - 120, 0, y + 6);
      g.addColorStop(0, "rgba(90,210,255,0)");
      g.addColorStop(1, "rgba(120,230,255,0.45)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 120, W, 126);
      ctx.strokeStyle = "rgba(200,245,255,0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(90,210,255,0.25)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 54) {
        ctx.beginPath();
        ctx.moveTo(e.ux, e.uy + 40);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    case "blackout": {
      // vòng xung EMP lan ra rồi cả thành phố tối sầm, chập chờn vài lần
      ctx.save();
      if (t > 0.5 && t < 1.8) {
        const u = (t - 0.5) / 1.3;
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(140,240,255,${1 - u})`;
        ctx.lineWidth = 18 * (1 - u) + 2;
        ctx.beginPath();
        ctx.ellipse(e.ux, e.uy, u * 1400, u * 900, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
      if (t > 1) {
        const flick = t < 1.8 ? (Math.sin(t * 60) > 0 ? 1 : 0.4) : 1;
        ctx.fillStyle = `rgba(2,3,10,${0.68 * flick})`;
        ctx.fillRect(-40, 1050, W + 80, H);
        ctx.fillStyle = `rgba(2,3,10,${0.35 * flick})`;
        ctx.fillRect(-40, -40, W + 80, 1090);
      }
      ctx.restore();
      return;
    }
    case "goldrain": {
      // mưa vàng trút từ đĩa xuống phố
      if (t < 0.4) return;
      ctx.save();
      for (const [a, b, c, d] of COINS) {
        const start = 0.4 + a * 4;
        const u = (t - start) / (0.9 + b * 0.6);
        if (u < 0 || u > 1) continue;
        const x = e.ux + (c - 0.5) * 900 * u + (c - 0.5) * 120;
        const y = e.uy + 60 + u * u * 800;
        const s = 6 + d * 7;
        const flip = Math.abs(Math.sin(e.time * 10 + a * 20));
        ctx.fillStyle = "#ffd55a";
        ctx.beginPath();
        ctx.ellipse(x, y, s * flip + 1, s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,250,200,0.9)";
        ctx.fillRect(x - 1, y - s * 0.6, 2, s * 0.5);
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp((t - 0.5) / 1, 0, 0.35);
      ctx.drawImage(e.glows[0], e.ux - 500, e.uy, 1000, 900);
      ctx.restore();
      return;
    }
    case "web": {
      // tơ trùm cả thành phố: nan toả từ nhện xuống mặt đất
      const grow = clamp((t - 0.4) / 1.4, 0, 1);
      if (grow <= 0) return;
      const cx = e.ux;
      const cy = e.uy + 60;
      const R = 1300 * grow;
      ctx.save();
      ctx.strokeStyle = "rgba(230,255,220,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const spokes = 22;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      }
      for (let j = 1; j <= 9; j++) {
        const rr = (R * j) / 9;
        for (let i = 0; i <= spokes; i++) {
          const a = (i / spokes) * Math.PI * 2;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(125,255,74,0.15)";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();
      return;
    }
    case "tilt": {
      // xoáy hố đen khổng lồ nuốt cả phố (thế giới nghiêng xử lý ở game.draw)
      if (t < 0.3) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 7; i++) {
        const f = 1 - ((e.time * 0.7 + i / 7) % 1);
        ctx.globalAlpha = (1 - f) * 0.7;
        ctx.strokeStyle = i % 2 ? "rgba(255,150,60,0.9)" : "rgba(190,90,255,0.9)";
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let k = 0; k <= 48; k++) {
          const a = (k / 48) * Math.PI * 2 + e.time * 2 + i;
          const rr = 80 + f * 900;
          const x = e.mx + Math.cos(a) * rr;
          const y = e.my + Math.sin(a) * rr * 0.7;
          if (k) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    case "crystal": {
      // gai pha lê mọc từ mặt đất lan ra từ giữa
      ctx.save();
      for (const [a, b, c] of SPIKES) {
        const x = 40 + a * (W - 80);
        const delay = 0.5 + Math.abs(x - W / 2) / 500;
        const g = clamp((t - delay) / 0.5, 0, 1);
        if (g <= 0) continue;
        const h = (160 + b * 260) * (g < 1 ? g * g * (3 - 2 * g) : 1);
        const w = 26 + c * 30;
        const base = GROUND_Y + 40 + c * 60;
        const grd = ctx.createLinearGradient(0, base - h, 0, base);
        grd.addColorStop(0, "rgba(220,255,255,0.95)");
        grd.addColorStop(0.5, "rgba(110,210,255,0.85)");
        grd.addColorStop(1, "rgba(120,70,255,0.8)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, base);
        ctx.lineTo(x - w * 0.2, base - h);
        ctx.lineTo(x + w * 0.15, base - h * 0.92);
        ctx.lineTo(x + w / 2, base);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    case "flag": {
      // cờ ngoài hành tinh cắm trên nóc nhà giữa phố
      const g = clamp((t - 3) / 0.6, 0, 1);
      if (g <= 0) return;
      const x = W / 2 + 160;
      const base = GROUND_Y - 20;
      const top = base - 260 * g;
      ctx.save();
      ctx.strokeStyle = "#c9ced8";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, top);
      ctx.stroke();
      if (g >= 1) {
        ctx.fillStyle = "#3dff7a";
        ctx.beginPath();
        ctx.moveTo(x, top);
        for (let i = 0; i <= 10; i++) {
          const fx = x + i * 16;
          ctx.lineTo(fx, top + Math.sin(e.time * 5 - i * 0.6) * 6);
        }
        for (let i = 10; i >= 0; i--) ctx.lineTo(x + i * 16, top + 90 + Math.sin(e.time * 5 - i * 0.6) * 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#08130c";
        ctx.font = "900 54px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("👽", x + 80, top + 46);
      }
      ctx.restore();
      return;
    }
    case "lava": {
      // mặt đất nứt, dung nham phát sáng trào lên qua khe
      const g = clamp((t - 0.5) / 1.2, 0, 1);
      if (g <= 0) return;
      ctx.save();
      ctx.fillStyle = `rgba(120,20,0,${0.35 * g})`;
      ctx.fillRect(-40, 1000, W + 80, H);
      ctx.globalCompositeOperation = "lighter";
      for (const [a, b, c, d] of CRACKS) {
        let x = a * W;
        let y = GROUND_Y - 40 + b * 300;
        const n = Math.floor(8 * g);
        const pts: [number, number][] = [[x, y]];
        const rr = mulberry32(Math.floor(a * 1e6));
        for (let i = 0; i < n; i++) {
          x += (rr() - 0.5) * 120;
          y += (rr() - 0.4) * 50;
          pts.push([x, y]);
        }
        for (const [w, col] of [[16, "rgba(255,80,0,0.35)"], [6, "rgba(255,170,40,0.9)"], [2, "rgba(255,245,200,1)"]] as const) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w * (0.7 + 0.3 * Math.sin(e.time * 6 + c * 9));
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
        }
        if (g > 0.6 && d > 0.4) {
          const [px, py] = pts[pts.length - 1];
          const s = 60 + 30 * Math.sin(e.time * 4 + c * 7);
          ctx.globalAlpha = 0.7;
          ctx.drawImage(e.glows[1], px - s, py - s, s * 2, s * 2);
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
      return;
    }
    default:
      return;
  }
}

// ======================= lớp màn hình (trên cùng, trước chữ) =======================

export function drawScreen(ctx: CanvasRenderingContext2D, fx: CityFx, e: Env) {
  const t = e.t;
  if (fx === "ink") {
    // mực tím phun loang khắp màn, chảy dài
    const g = clamp((t - 0.7) / 1.5, 0, 1);
    if (g <= 0) return;
    const fade = clamp((9 - t) / 1.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    for (const [a, b, c, d] of INK) {
      const x = a * W;
      const y = 300 + b * 1300;
      const delay = c * 0.8;
      const k = clamp((t - 0.7 - delay) / 0.6, 0, 1);
      if (k <= 0) continue;
      const r = (160 + d * 260) * (k < 1 ? 1 - Math.pow(1 - k, 3) : 1);
      const grd = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      grd.addColorStop(0, "rgba(40,6,60,0.92)");
      grd.addColorStop(0.75, "rgba(70,14,100,0.8)");
      grd.addColorStop(1, "rgba(70,14,100,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      // vệt chảy
      ctx.fillStyle = "rgba(45,8,70,0.85)";
      const drip = clamp(t - 1.4 - delay, 0, 3) * 90 * (0.5 + d);
      ctx.fillRect(x - 10 + d * 20, y, 14 + d * 10, r * 0.6 + drip);
    }
    ctx.restore();
    return;
  }
  if (fx === "glitch") {
    // nhiễu sóng như mất tín hiệu: dải lệch ngang, sọc màu, chớp trắng đen
    if (t < 0.6 || t > 6) return;
    const r = mulberry32(Math.floor(e.time * 20));
    ctx.save();
    const strong = t < 2.5 ? 1 : 0.4;
    for (let i = 0; i < 9 * strong; i++) {
      const y = r() * H;
      const h = 6 + r() * 60;
      const dx = (r() - 0.5) * 120;
      ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h);
    }
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5 * strong; i++) {
      ctx.fillStyle = [`rgba(255,0,80,0.18)`, `rgba(0,255,220,0.18)`, `rgba(80,120,255,0.18)`][i % 3];
      ctx.fillRect(0, r() * H, W, 3 + r() * 20);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
    ctx.restore();
    return;
  }
  if (fx === "cracks") {
    // màn hình nứt vỡ như kính từ 1 điểm va chạm
    const g = clamp((t - 1.1) / 0.25, 0, 1);
    if (g <= 0) return;
    const fade = clamp((8.8 - t) / 1.2, 0, 1);
    const cx = W * 0.42;
    const cy = H * 0.46;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = "rgba(235,235,255,0.85)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (const [a, b] of GLASS) {
      const ang = a * Math.PI * 2;
      let x = cx;
      let y = cy;
      ctx.moveTo(x, y);
      const len = (600 + b * 900) * g;
      for (let s = 1; s <= 6; s++) {
        const d = (len * s) / 6;
        x = cx + Math.cos(ang + Math.sin(s * 3 + a * 9) * 0.08) * d;
        y = cy + Math.sin(ang + Math.sin(s * 3 + a * 9) * 0.08) * d;
        ctx.lineTo(x, y);
      }
    }
    for (const rr of [60, 150, 280]) {
      for (let i = 0; i < GLASS.length; i++) {
        const a0 = GLASS[i][0] * Math.PI * 2;
        const a1 = GLASS[(i + 1) % GLASS.length][0] * Math.PI * 2;
        ctx.moveTo(cx + Math.cos(a0) * rr * g, cy + Math.sin(a0) * rr * g);
        ctx.lineTo(cx + Math.cos(a1) * rr * 1.1 * g, cy + Math.sin(a1) * rr * 1.1 * g);
      }
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(e.glows[5], cx - 120, cy - 120, 240, 240);
    ctx.restore();
  }
}
