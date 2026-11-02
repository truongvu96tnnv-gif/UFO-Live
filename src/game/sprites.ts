import { font } from "./font";
import { mulberry32 } from "./math";
import { GROUND_Y, H, W } from "./stage";

/** Sprite vẽ sẵn ra canvas phụ để mỗi frame chỉ cần drawImage */
export type Img = HTMLCanvasElement;

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

export function makeGlow(r: number, g: number, b: number, size = 64): Img {
  const [c, ctx] = canvas(size, size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.15, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.3)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Ngôi sao lấp lánh 4 cánh */
export function makeStar(size = 96): Img {
  const [c, ctx] = canvas(size, size);
  const m = size / 2;
  ctx.translate(m, m);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, m);
  glow.addColorStop(0, "rgba(255,250,220,1)");
  glow.addColorStop(0.2, "rgba(255,220,140,0.6)");
  glow.addColorStop(1, "rgba(255,200,100,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, m * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,248,225,0.95)";
  for (let k = 0; k < 2; k++) {
    ctx.save();
    ctx.rotate((k * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(0, -m);
    ctx.quadraticCurveTo(m * 0.07, -m * 0.07, m, 0);
    ctx.quadraticCurveTo(m * 0.07, m * 0.07, 0, m);
    ctx.quadraticCurveTo(-m * 0.07, m * 0.07, -m, 0);
    ctx.quadraticCurveTo(-m * 0.07, -m * 0.07, 0, -m);
    ctx.fill();
    ctx.restore();
  }
  return c;
}

// ---------------- Đĩa bay (giữ nguyên tạo hình từ Option 5/7 của LuckyDraw) ----------------

export const SW = 700; // khung sprite đĩa bay
export const SH = 300;
export const SCX = SW / 2; // tâm thân đĩa trong sprite
export const SCY = 160;
export const DISC_RX = 320;
export const DISC_RY = 62;
export const BELLY_Y = 58; // lõi sáng dưới bụng (so với tâm thân)

/**
 * Thân đĩa bay kim loại xám thép: tấm ghép, rãnh đồng tâm, vòm thấp có ô cửa sáng.
 * `tint`: phủ màu lên toàn thân (UFO VÀNG — trùm hiếm).
 */
export function makeSaucer(tint?: string): Img {
  const [c, g] = canvas(SW, SH);
  const rnd = mulberry32(909);
  const belly = g.createLinearGradient(0, SCY, 0, SCY + 80);
  belly.addColorStop(0, "#22262d");
  belly.addColorStop(1, "#07080a");
  g.fillStyle = belly;
  g.beginPath();
  g.ellipse(SCX, SCY + 30, 236, 46, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(150,165,185,0.18)";
  g.lineWidth = 2;
  for (const s of [0.82, 0.62]) {
    g.beginPath();
    g.ellipse(SCX, SCY + 34 + (1 - s) * 22, 236 * s, 46 * s, 0, 0, Math.PI);
    g.stroke();
  }

  const disc = g.createLinearGradient(0, SCY - DISC_RY, 0, SCY + DISC_RY);
  disc.addColorStop(0, "#8a929e");
  disc.addColorStop(0.35, "#4a515c");
  disc.addColorStop(0.62, "#262b33");
  disc.addColorStop(1, "#0b0d11");
  g.save();
  g.fillStyle = disc;
  g.beginPath();
  g.ellipse(SCX, SCY, DISC_RX, DISC_RY, 0, 0, Math.PI * 2);
  g.fill();
  g.clip();
  for (let i = 0; i < 1800; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd());
    const x = SCX + Math.cos(a) * DISC_RX * d;
    const y = SCY + Math.sin(a) * DISC_RY * d;
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${rnd() * 0.07})` : `rgba(0,0,0,${rnd() * 0.18})`;
    g.fillRect(x, y, 2 + rnd() * 6, 1);
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r0 = i % 2 ? 0.45 : 0.62;
    g.strokeStyle = "rgba(0,0,0,0.4)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(SCX + Math.cos(a) * DISC_RX * r0, SCY + Math.sin(a) * DISC_RY * r0);
    g.lineTo(SCX + Math.cos(a) * DISC_RX, SCY + Math.sin(a) * DISC_RY);
    g.stroke();
  }
  for (const s of [0.45, 0.62, 0.8, 0.93]) {
    g.lineWidth = 2;
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.beginPath();
    g.ellipse(SCX, SCY, DISC_RX * s, DISC_RY * s, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "rgba(200,215,235,0.16)";
    g.beginPath();
    g.ellipse(SCX, SCY + 2, DISC_RX * s, DISC_RY * s, 0, 0.05, Math.PI - 0.05);
    g.stroke();
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(SCX + side * (180 + i * 11) - 3, SCY + 8, 5, 20);
    }
  }
  const spec = g.createRadialGradient(SCX + 140, SCY - 40, 4, SCX + 140, SCY - 40, 220);
  spec.addColorStop(0, "rgba(225,235,255,0.42)");
  spec.addColorStop(1, "rgba(225,235,255,0)");
  g.fillStyle = spec;
  g.fillRect(0, 0, SW, SH);
  g.restore();
  g.lineWidth = 3;
  g.strokeStyle = "#050608";
  g.beginPath();
  g.ellipse(SCX, SCY, DISC_RX, DISC_RY, 0, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1.5;
  g.strokeStyle = "rgba(220,230,250,0.55)";
  g.beginPath();
  g.ellipse(SCX, SCY - 1, DISC_RX - 2, DISC_RY - 2, 0, Math.PI * 1.05, Math.PI * 1.95);
  g.stroke();

  const dome = g.createLinearGradient(0, SCY - 110, 0, SCY - 20);
  dome.addColorStop(0, "#9aa3af");
  dome.addColorStop(0.5, "#4b525d");
  dome.addColorStop(1, "#1a1e24");
  g.fillStyle = dome;
  g.beginPath();
  g.ellipse(SCX, SCY - 26, 150, 78, 0, Math.PI, 0);
  g.ellipse(SCX, SCY - 26, 150, 22, 0, 0, Math.PI);
  g.fill();
  g.fillStyle = "#2a2f37";
  g.beginPath();
  g.ellipse(SCX, SCY - 98, 48, 14, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(220,230,250,0.45)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(SCX, SCY - 99, 46, 12, 0, Math.PI * 1.05, Math.PI * 1.95);
  g.stroke();
  for (const s of [0.55, 0.82]) {
    g.strokeStyle = "rgba(0,0,0,0.45)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(SCX, SCY - 26 - (1 - s) * 70, 150 * s, 22 * s, 0, 0, Math.PI);
    g.stroke();
  }
  // ô cửa: kẻ xâm lược thì cửa đỏ
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * (0.12 + (0.76 * i) / 12);
    const x = SCX + Math.cos(a) * 134;
    const y = SCY - 30 + Math.sin(a) * 18;
    const w = 12 * Math.sin(a) + 3;
    g.fillStyle = "rgba(255,90,90,0.95)";
    g.fillRect(x - w / 2, y - 3, w, 5);
    g.fillStyle = "rgba(255,80,80,0.2)";
    g.fillRect(x - w, y - 7, w * 2, 13);
  }
  const ds = g.createRadialGradient(SCX + 60, SCY - 90, 2, SCX + 60, SCY - 90, 90);
  ds.addColorStop(0, "rgba(240,245,255,0.5)");
  ds.addColorStop(1, "rgba(240,245,255,0)");
  g.fillStyle = ds;
  g.beginPath();
  g.ellipse(SCX, SCY - 26, 150, 78, 0, Math.PI, 0);
  g.fill();

  if (tint) {
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = tint;
    g.fillRect(0, 0, SW, SH);
    g.globalCompositeOperation = "source-over";
  }
  return c;
}

/** Lớp bong bóng thuỷ tinh phủ lên ảnh: viền fresnel, ánh cầu vồng chạy quanh mép, đốm sáng & phản chiếu */
export function makeBubble(hue: number): Img {
  const S = 200;
  const r = S / 2 - 4;
  const [c, g] = canvas(S, S);
  const m = S / 2;
  const rim = g.createRadialGradient(m, m, r * 0.6, m, m, r);
  rim.addColorStop(0, "rgba(255,255,255,0)");
  rim.addColorStop(0.7, `hsla(${hue},70%,80%,0.10)`);
  rim.addColorStop(0.93, `hsla(${hue},80%,88%,0.55)`);
  rim.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rim;
  g.beginPath();
  g.arc(m, m, r, 0, Math.PI * 2);
  g.fill();
  const iri = g.createConicGradient(hue / 57, m, m);
  for (const [s, h] of [[0, 320], [0.2, 200], [0.4, 50], [0.6, 160], [0.8, 280], [1, 320]] as const) {
    iri.addColorStop(s, `hsla(${(h + hue) % 360},90%,70%,0.32)`);
  }
  g.strokeStyle = iri;
  g.lineWidth = 7;
  g.beginPath();
  g.arc(m, m, r - 5, 0, Math.PI * 2);
  g.stroke();
  const hl = g.createLinearGradient(m - r, m - r, m, m);
  hl.addColorStop(0, "rgba(255,255,255,0.55)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  g.strokeStyle = hl;
  g.lineWidth = r * 0.12;
  g.lineCap = "round";
  g.beginPath();
  g.arc(m, m, r * 0.8, Math.PI * 1.05, Math.PI * 1.45);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.beginPath();
  g.ellipse(m - r * 0.38, m - r * 0.56, r * 0.13, r * 0.07, -0.6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.28)";
  g.lineWidth = r * 0.05;
  g.beginPath();
  g.arc(m, m, r * 0.82, Math.PI * 0.12, Math.PI * 0.42);
  g.stroke();
  return c;
}

// ---------------- Nền: trời đêm + thành phố khổ dọc ----------------

/** Toà nhà (để vẽ cửa sổ sáng lúc chạy & đèn đỏ đỉnh) */
export interface Tower {
  x: number;
  w: number;
  top: number;
}

/** Nền tĩnh: trời đêm, Ngân Hà, trăng, thành phố 2 lớp có cửa sổ sáng, mặt đất & bệ phóng */
export function makeBackground(): { img: Img; towers: Tower[] } {
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(55);
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#020309");
  sky.addColorStop(0.35, "#060b1c");
  sky.addColorStop(0.62, "#101a33");
  sky.addColorStop(0.78, "#1b2140");
  sky.addColorStop(1, "#05060c");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // Ngân Hà chéo từ góc trên phải xuống trái
  const ax = 1000, ay = -100, bx = 80, by = 1100;
  const len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len, uy = (by - ay) / len;
  const along = (t: number, off: number): [number, number] => [ax + ux * t * len - uy * off, ay + uy * t * len + ux * off];
  g.save();
  g.filter = "blur(30px)";
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 60; i++) {
    const [x, y] = along(rnd(), gauss() * 110);
    g.fillStyle = rnd() < 0.4 ? `rgba(200,170,150,${0.035 + rnd() * 0.04})` : `rgba(130,150,210,${0.035 + rnd() * 0.045})`;
    g.beginPath();
    g.ellipse(x, y, 80 + rnd() * 110, 36 + rnd() * 50, Math.atan2(uy, ux), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  for (let i = 0; i < 5000; i++) {
    const [x, y] = along(rnd(), gauss() * 140);
    g.fillStyle = `rgba(${215 + rnd() * 40},${215 + rnd() * 40},255,${0.15 + rnd() * 0.5})`;
    g.fillRect(x, y, rnd() < 0.9 ? 1 : 1.8, rnd() < 0.9 ? 1 : 1.8);
  }
  for (let i = 0; i < 700; i++) {
    const y = rnd() * 1250;
    g.fillStyle = `rgba(255,${225 + rnd() * 30},${200 + rnd() * 55},${0.2 + rnd() * 0.7})`;
    g.beginPath();
    g.arc(rnd() * W, y, 0.4 + rnd() * 1.4, 0, Math.PI * 2);
    g.fill();
  }
  // Trăng lưỡi liềm
  const mx = 170, my = 430;
  const halo = g.createRadialGradient(mx, my, 20, mx, my, 220);
  halo.addColorStop(0, "rgba(220,230,255,0.22)");
  halo.addColorStop(1, "rgba(220,230,255,0)");
  g.fillStyle = halo;
  g.fillRect(mx - 220, my - 220, 440, 440);
  g.save();
  g.beginPath();
  g.arc(mx, my, 52, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = "#e9ecf5";
  g.fill();
  g.fillStyle = "#0a1022";
  g.beginPath();
  g.arc(mx + 24, my - 14, 50, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // Ánh đèn thành phố hắt lên chân trời
  const glow = g.createLinearGradient(0, 1150, 0, 1500);
  glow.addColorStop(0, "rgba(255,150,90,0)");
  glow.addColorStop(1, "rgba(255,140,90,0.28)");
  g.fillStyle = glow;
  g.fillRect(0, 1150, W, 350);

  const towers: Tower[] = [];
  // Lớp xa: toà nhà xanh tím mờ
  let x = -20;
  while (x < W) {
    const w = 40 + rnd() * 70;
    const top = 1270 + rnd() * 120;
    g.fillStyle = "#151a33";
    g.fillRect(x, top, w, GROUND_Y - top + 20);
    for (let yy = top + 10; yy < GROUND_Y; yy += 16) {
      for (let xx = x + 6; xx < x + w - 6; xx += 12) {
        if (rnd() < 0.22) {
          g.fillStyle = `rgba(255,${200 + rnd() * 40},${120 + rnd() * 60},${0.25 + rnd() * 0.3})`;
          g.fillRect(xx, yy, 4, 6);
        }
      }
    }
    x += w + 2;
  }
  // Lớp gần: toà cao hơn, tối hơn, có ăng-ten
  x = -10;
  while (x < W) {
    const w = 70 + rnd() * 110;
    const top = 1350 + rnd() * 150;
    towers.push({ x, w, top });
    const body = g.createLinearGradient(x, 0, x + w, 0);
    body.addColorStop(0, "#0b0e1c");
    body.addColorStop(1, "#171c33");
    g.fillStyle = body;
    g.fillRect(x, top, w, H - top);
    g.fillStyle = "rgba(160,180,255,0.12)";
    g.fillRect(x, top, w, 2);
    if (rnd() < 0.5) {
      g.fillStyle = "#0b0e1c";
      g.fillRect(x + w * 0.5 - 2, top - 40, 4, 40);
    }
    for (let yy = top + 14; yy < H - 40; yy += 22) {
      for (let xx = x + 10; xx < x + w - 10; xx += 18) {
        if (rnd() < 0.3) {
          const warm = rnd() < 0.75;
          g.fillStyle = warm ? `rgba(255,${190 + rnd() * 50},${110 + rnd() * 60},${0.5 + rnd() * 0.45})` : `rgba(150,210,255,${0.4 + rnd() * 0.4})`;
          g.fillRect(xx, yy, 8, 10);
        }
      }
    }
    x += w + 4;
  }
  // Sương mù dưới chân phố cho chữ chat TikTok dễ đọc
  const fog = g.createLinearGradient(0, 1560, 0, H);
  fog.addColorStop(0, "rgba(4,5,12,0)");
  fog.addColorStop(1, "rgba(4,5,12,0.92)");
  g.fillStyle = fog;
  g.fillRect(0, 1560, W, H - 1560);
  return { img: c, towers };
}

/** Ảnh đại diện tạm (chữ cái đầu trên nền màu) — dùng khi chưa tải được avatar hoặc chế độ demo */
export function makeInitialAvatar(name: string, hue: number, size = 128): Img {
  const [c, g] = canvas(size, size);
  const bg = g.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, `hsl(${hue},70%,58%)`);
  bg.addColorStop(1, `hsl(${(hue + 40) % 360},70%,34%)`);
  g.fillStyle = bg;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.fill();
  const letter = [...(name.trim() || "?")][0].toUpperCase();
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.font = font(700, size * 0.52);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, size / 2, size / 2 + size * 0.04);
  return c;
}

/** Cắt ảnh thành hình tròn (vẽ sẵn 1 lần) */
export function circleCrop(img: CanvasImageSource, w: number, h: number, size = 128): Img {
  const [c, g] = canvas(size, size);
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.clip();
  const s = Math.max(size / w, size / h);
  g.drawImage(img, (size - w * s) / 2, (size - h * s) / 2, w * s, h * s);
  return c;
}
