// Vẽ "phim": bối cảnh và nhân vật bằng code (không cần file ảnh). Mọi toạ độ theo khung phim FW × FH.
import { mulberry32 } from "../game/math";
import type { Actor, BgId } from "./films";

export const FW = 960;
export const FH = 620;
/** đường chân nhân vật — nằm trên dải phụ đề để phụ đề không che người */
export const FLOOR = FH - 175;

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function sky(g: G, top: string, bottom: string, h = FH) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, FW, h);
}

function stars(g: G, t: number, n: number, seed: number, h = FH * 0.6, drift = 0) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = (((r() * FW - t * drift * (0.3 + r())) % FW) + FW) % FW;
    const y = r() * h;
    const tw = 0.5 + 0.5 * Math.sin(t * (1 + r() * 2) + i);
    g.globalAlpha = 0.3 + 0.7 * tw;
    g.fillStyle = "#fff";
    g.fillRect(x, y, 2, 2);
  }
  g.globalAlpha = 1;
}

function moon(g: G, x: number, y: number, r: number) {
  const glow = g.createRadialGradient(x, y, r * 0.5, x, y, r * 3);
  glow.addColorStop(0, "rgba(255,240,200,0.35)");
  glow.addColorStop(1, "rgba(255,240,200,0)");
  g.fillStyle = glow;
  g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  g.fillStyle = "#fff6d8";
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(200,190,160,0.35)";
  for (const [dx, dy, rr] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.12], [-0.05, 0.35, 0.1]]) {
    g.beginPath();
    g.arc(x + dx * r, y + dy * r, rr * r, 0, TAU);
    g.fill();
  }
}

/** đĩa bay nhỏ của Bíp */
export function saucer(g: G, x: number, y: number, s: number, t: number, smoke = false) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  const beam = g.createRadialGradient(0, 30, 10, 0, 30, 160);
  beam.addColorStop(0, "rgba(120,255,200,0.45)");
  beam.addColorStop(1, "rgba(120,255,200,0)");
  g.fillStyle = beam;
  g.fillRect(-160, -130, 320, 320);
  g.fillStyle = "rgba(160,240,255,0.85)";
  g.beginPath();
  g.ellipse(0, -18, 40, 34, 0, Math.PI, 0);
  g.fill();
  const body = g.createLinearGradient(0, -20, 0, 26);
  body.addColorStop(0, "#d9e3f0");
  body.addColorStop(1, "#4d5a70");
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(0, 0, 100, 24, 0, 0, TAU);
  g.fill();
  for (let i = 0; i < 6; i++) {
    const on = Math.sin(t * 6 + i) > 0;
    g.fillStyle = on ? "#7dffc8" : "#2a6a58";
    g.beginPath();
    g.arc(-70 + i * 28, 4, 6, 0, TAU);
    g.fill();
  }
  g.restore();
  if (smoke) {
    for (let i = 0; i < 6; i++) {
      const p = (t * 0.35 + i / 6) % 1;
      g.globalAlpha = 0.45 * (1 - p);
      g.fillStyle = "#9aa3b5";
      g.beginPath();
      g.arc(x + 50 * s + Math.sin(p * 6 + i) * 18, y - 20 * s - p * 160, (14 + p * 40) * s, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

function house(g: G, x: number, base: number, w: number, h: number, lit: boolean, t: number, seed: number) {
  g.fillStyle = "#141b2e";
  g.fillRect(x, base - h, w, h);
  g.fillStyle = "#0d1222";
  g.beginPath();
  g.moveTo(x - 14, base - h);
  g.quadraticCurveTo(x + w / 2, base - h - w * 0.55, x + w + 14, base - h);
  g.closePath();
  g.fill();
  if (lit) {
    const flick = 0.85 + 0.15 * Math.sin(t * 9 + seed);
    g.fillStyle = `rgba(255,190,90,${flick})`;
    g.fillRect(x + w * 0.3, base - h * 0.65, w * 0.22, h * 0.3);
  }
}

function bamboo(g: G, x: number, base: number, h: number, t: number) {
  g.strokeStyle = "#0b1a14";
  g.lineWidth = 7;
  for (let i = 0; i < 4; i++) {
    const sway = Math.sin(t * 0.8 + i) * 8;
    g.beginPath();
    g.moveTo(x + i * 16, base);
    g.quadraticCurveTo(x + i * 16 + sway / 2, base - h / 2, x + i * 16 + sway, base - h - i * 20);
    g.stroke();
  }
}

function fireflies(g: G, t: number, n: number, seed: number) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const bx = r() * FW;
    const by = FH * 0.45 + r() * FH * 0.4;
    const x = bx + Math.sin(t * (0.4 + r()) + i) * 30;
    const y = by + Math.cos(t * (0.5 + r()) + i * 2) * 20;
    const a = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
    const gl = g.createRadialGradient(x, y, 0, x, y, 14);
    gl.addColorStop(0, `rgba(220,255,120,${a})`);
    gl.addColorStop(1, "rgba(220,255,120,0)");
    g.fillStyle = gl;
    g.fillRect(x - 14, y - 14, 28, 28);
  }
}

function village(g: G, t: number) {
  sky(g, "#070b22", "#1d2a55");
  stars(g, t, 80, 3);
  moon(g, 780, 110, 44);
  const base = FLOOR + 20;
  g.fillStyle = "#0a1020";
  g.fillRect(0, base, FW, FH - base);
  bamboo(g, 30, base, 260, t);
  bamboo(g, 880, base, 240, t + 2);
  house(g, 120, base, 170, 130, false, t, 1);
  house(g, 360, base, 140, 110, true, t, 2);
  house(g, 560, base, 190, 140, false, t, 3);
  fireflies(g, t, 14, 11);
}

function field(g: G, t: number) {
  sky(g, "#081028", "#22305c");
  stars(g, t, 70, 5);
  moon(g, 160, 100, 36);
  const base = FH * 0.55;
  g.fillStyle = "#0c2018";
  g.fillRect(0, base, FW, FH - base);
  for (let row = 0; row < 9; row++) {
    const y = base + 12 + row * row * 5.5;
    g.strokeStyle = `rgba(80,${120 + row * 10},70,${0.35 + row * 0.06})`;
    g.lineWidth = 2 + row * 0.5;
    g.beginPath();
    for (let x = -20; x <= FW + 20; x += 18) {
      const sway = Math.sin(t * 1.4 + x * 0.02 + row) * (2 + row * 0.6);
      g.moveTo(x, y);
      g.lineTo(x + sway, y - 10 - row * 2);
    }
    g.stroke();
  }
  saucer(g, 720, base + 30, 0.9, t, true);
  fireflies(g, t, 10, 7);
}

function space(g: G, t: number) {
  sky(g, "#05030f", "#1a0b35");
  stars(g, t, 160, 9, FH, 60);
  // hố đen
  const bx = 760, by = 180;
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = `hsla(${280 + i * 12},90%,${60 - i * 6}%,${0.5 - i * 0.08})`;
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(bx, by, 90 + i * 22, 28 + i * 8, -0.25 + Math.sin(t * 0.3) * 0.05, t * 0.6 + i, t * 0.6 + i + Math.PI * 1.6);
    g.stroke();
  }
  g.fillStyle = "#000";
  g.beginPath();
  g.arc(bx, by, 52, 0, TAU);
  g.fill();
  // hành tinh
  const p = g.createRadialGradient(130, 470, 10, 160, 500, 140);
  p.addColorStop(0, "#5ad1ff");
  p.addColorStop(1, "#13306a");
  g.fillStyle = p;
  g.beginPath();
  g.arc(160, 520, 130, 0, TAU);
  g.fill();
  saucer(g, 470 + Math.sin(t * 0.9) * 30, 300 + Math.sin(t * 1.3) * 16, 1.1, t);
}

function boba(g: G, t: number) {
  sky(g, "#12051f", "#3a1450");
  stars(g, t, 90, 13, FH, 20);
  // quán trà sữa trên tiểu hành tinh
  g.fillStyle = "#3b2a4d";
  g.beginPath();
  g.ellipse(FW / 2, FH + 120, 620, 260, 0, 0, TAU);
  g.fill();
  g.fillStyle = "#ffcf9a";
  g.fillRect(250, 230, 460, 260);
  g.fillStyle = "#ff6fae";
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(230 + i * 62.5, 230);
    g.lineTo(230 + (i + 1) * 62.5, 230);
    g.lineTo(230 + (i + 0.5) * 62.5, 280);
    g.closePath();
    g.fill();
  }
  const neon = 0.7 + 0.3 * Math.sin(t * 5);
  g.shadowColor = "#ff6fae";
  g.shadowBlur = 20 * neon;
  g.fillStyle = `rgba(255,240,250,${neon})`;
  g.font = "700 46px 'Chakra Petch', sans-serif";
  g.textAlign = "center";
  g.fillText("TRÀ SỮA VŨ TRỤ", FW / 2, 210);
  g.shadowBlur = 0;
  // cốc trà sữa khổng lồ
  g.fillStyle = "rgba(240,220,190,0.95)";
  g.beginPath();
  g.moveTo(420, 320);
  g.lineTo(540, 320);
  g.lineTo(525, 470);
  g.lineTo(435, 470);
  g.closePath();
  g.fill();
  g.fillStyle = "#3a2216";
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.arc(445 + (i % 4) * 22 + (i > 3 ? 11 : 0), 455 - (i > 3 ? 18 : 0), 8, 0, TAU);
    g.fill();
  }
  g.strokeStyle = "#ff6fae";
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(495, 330);
  g.lineTo(520, 270);
  g.stroke();
}

function alley(g: G, t: number) {
  sky(g, "#05060d", "#151827");
  // hai bức tường hẻm hội tụ về cuối
  g.fillStyle = "#1a1d2a";
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(380, 180);
  g.lineTo(380, 470);
  g.lineTo(0, FH);
  g.fill();
  g.beginPath();
  g.moveTo(FW, 0);
  g.lineTo(580, 180);
  g.lineTo(580, 470);
  g.lineTo(FW, FH);
  g.fill();
  g.fillStyle = "#0e1019";
  g.beginPath();
  g.moveTo(0, FH);
  g.lineTo(380, 470);
  g.lineTo(580, 470);
  g.lineTo(FW, FH);
  g.fill();
  // nhà cuối hẻm
  g.fillStyle = "#0b0c14";
  g.fillRect(390, 230, 180, 240);
  const on = Math.sin(t * 2.3) > -0.85;
  g.fillStyle = on ? "rgba(255,210,120,0.95)" : "rgba(80,60,40,0.8)";
  g.fillRect(450, 260, 60, 50);
  // đèn đường chập chờn
  const flick = Math.sin(t * 17) > 0.3 || Math.sin(t * 3) > 0 ? 1 : 0.25;
  const lamp = g.createRadialGradient(200, 160, 4, 200, 260, 260);
  lamp.addColorStop(0, `rgba(255,220,150,${0.55 * flick})`);
  lamp.addColorStop(1, "rgba(255,220,150,0)");
  g.fillStyle = lamp;
  g.fillRect(0, 0, 480, FH);
  g.fillStyle = "#30333f";
  g.fillRect(196, 150, 8, 330);
  g.fillStyle = `rgba(255,230,170,${flick})`;
  g.beginPath();
  g.arc(200, 150, 12, 0, TAU);
  g.fill();
  // dây điện
  g.strokeStyle = "#05060a";
  g.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(0, 60 + i * 30);
    g.quadraticCurveTo(FW / 2, 120 + i * 30 + Math.sin(t + i) * 4, FW, 50 + i * 34);
    g.stroke();
  }
}

function room(g: G, t: number, warm: boolean) {
  sky(g, warm ? "#2a170d" : "#0b0a14", warm ? "#4a2a14" : "#191527");
  // sàn gỗ
  const base = FLOOR + 10;
  g.fillStyle = warm ? "#3b2212" : "#15121c";
  g.fillRect(0, base, FW, FH - base);
  g.strokeStyle = warm ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.04)";
  for (let x = -200; x < FW + 200; x += 80) {
    g.beginPath();
    g.moveTo(FW / 2 + (x - FW / 2) * 0.4, base);
    g.lineTo(x, FH);
    g.stroke();
  }
  // cửa sổ ánh trăng
  g.fillStyle = warm ? "rgba(255,200,120,0.25)" : "rgba(140,170,255,0.18)";
  g.fillRect(620, 90, 190, 240);
  g.strokeStyle = warm ? "#1d0f06" : "#07060c";
  g.lineWidth = 10;
  g.strokeRect(620, 90, 190, 240);
  g.beginPath();
  g.moveTo(715, 90);
  g.lineTo(715, 330);
  g.moveTo(620, 210);
  g.lineTo(810, 210);
  g.stroke();
}

function houseIn(g: G, t: number) {
  room(g, t, false);
  // cầu thang + mạng nhện
  g.fillStyle = "#0c0a12";
  for (let i = 0; i < 7; i++) g.fillRect(60 + i * 40, FLOOR + 10 - (i + 1) * 40, 40, (i + 1) * 40);
  g.strokeStyle = "rgba(220,220,240,0.25)";
  g.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(FW, 0);
    g.lineTo(FW - 170 * Math.cos((i / 5) * Math.PI / 2), 170 * Math.sin((i / 5) * Math.PI / 2));
    g.stroke();
  }
  for (let k = 1; k < 4; k++) {
    g.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = (i / 5) * Math.PI / 2;
      const x = FW - k * 45 * Math.cos(a), y = k * 45 * Math.sin(a);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // bóng đen lướt qua cửa sổ
  const sx = 600 + ((t * 70) % 400);
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.beginPath();
  g.ellipse(sx, 210, 26, 60, 0, 0, TAU);
  g.fill();
}

function kitchen(g: G, t: number) {
  room(g, t, true);
  // bếp + nồi bốc hơi
  g.fillStyle = "#2a1a10";
  g.fillRect(40, FLOOR - 150, 360, 160);
  g.fillStyle = "#1a1a1a";
  g.fillRect(60, FLOOR - 160, 320, 14);
  g.fillStyle = "#6b6f78";
  g.beginPath();
  g.ellipse(160, FLOOR - 190, 60, 18, 0, 0, TAU);
  g.fill();
  g.fillRect(100, FLOOR - 220, 120, 34);
  g.fillStyle = "#c98b3a";
  g.beginPath();
  g.ellipse(310, FLOOR - 170, 56, 12, 0, 0, TAU);
  g.fill();
  for (let i = 0; i < 5; i++) {
    const p = (t * 0.4 + i / 5) % 1;
    g.globalAlpha = 0.35 * (1 - p);
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(160 + Math.sin(p * 7 + i) * 16, FLOOR - 230 - p * 140, 12 + p * 22, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  // tủ lạnh
  g.fillStyle = "#d8d2c4";
  g.fillRect(850, FLOOR - 300, 90, 310);
  g.fillStyle = "#a9a294";
  g.fillRect(850, FLOOR - 190, 90, 4);
}

function stage(g: G, t: number) {
  sky(g, "#12041f", "#2a0a3a");
  for (let i = 0; i < 5; i++) {
    const a = Math.sin(t * 0.9 + i * 1.3) * 0.5;
    g.save();
    g.translate(120 + i * 180, -10);
    g.rotate(a);
    const beam = g.createLinearGradient(0, 0, 0, FH);
    beam.addColorStop(0, `hsla(${(i * 70 + t * 40) % 360},100%,70%,0.4)`);
    beam.addColorStop(1, "hsla(0,0%,100%,0)");
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(-14, 0);
    g.lineTo(14, 0);
    g.lineTo(110, FH);
    g.lineTo(-110, FH);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.fillStyle = "#1a0d26";
  g.fillRect(0, FLOOR + 10, FW, FH);
  g.fillStyle = "#ff3d8b";
  g.fillRect(0, FLOOR + 10, FW, 6);
  // điện thoại + đèn vòng
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = 10;
  g.beginPath();
  g.arc(830, 230, 70, 0, TAU);
  g.stroke();
  g.fillStyle = "#111";
  g.fillRect(808, 190, 44, 80);
  g.fillStyle = "#ff2b55";
  g.beginPath();
  g.arc(830, 205, 6, 0, TAU);
  g.fill();
  g.strokeStyle = "#444";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(830, 300);
  g.lineTo(800, FLOOR + 10);
  g.moveTo(830, 300);
  g.lineTo(860, FLOOR + 10);
  g.stroke();
}

const BG: Record<BgId, (g: G, t: number) => void> = { village, field, space, boba, alley, house: houseIn, kitchen, stage };

export function drawBackground(g: G, id: BgId, t: number) {
  g.save();
  BG[id](g, t);
  g.restore();
}

// ---------------- nhân vật ----------------

/** Người xem đóng vai: thân vẽ bằng code, đầu là ảnh đại diện */
export function drawPerson(g: G, x: number, y: number, s: number, hue: number, head: CanvasImageSource, t: number, name: string, scared = false) {
  const bob = Math.sin(t * (scared ? 14 : 2.4)) * (scared ? 2 : 3);
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.ellipse(0, 0, 50, 12, 0, 0, TAU);
  g.fill();
  // chân
  g.strokeStyle = `hsl(${hue},35%,22%)`;
  g.lineWidth = 16;
  g.lineCap = "round";
  const step = Math.sin(t * 3) * 4;
  g.beginPath();
  g.moveTo(-14, -70);
  g.lineTo(-16 - step, -6);
  g.moveTo(14, -70);
  g.lineTo(16 + step, -6);
  g.stroke();
  // thân
  const body = g.createLinearGradient(0, -170, 0, -60);
  body.addColorStop(0, `hsl(${hue},75%,58%)`);
  body.addColorStop(1, `hsl(${hue},70%,38%)`);
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(-36, -150 + bob);
  g.quadraticCurveTo(0, -172 + bob, 36, -150 + bob);
  g.lineTo(30, -62);
  g.lineTo(-30, -62);
  g.closePath();
  g.fill();
  // tay
  g.strokeStyle = `hsl(${hue},70%,48%)`;
  g.lineWidth = 13;
  const wave = scared ? -60 : Math.sin(t * 2.2) * 10;
  g.beginPath();
  g.moveTo(-34, -142 + bob);
  g.lineTo(-52, -92 + wave * 0.3);
  g.moveTo(34, -142 + bob);
  g.lineTo(52 + (scared ? 4 : 0), -92 + (scared ? wave * 0.6 : -wave * 0.3));
  g.stroke();
  // đầu = ảnh đại diện
  const hy = -205 + bob;
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(0, hy, 48, 0, TAU);
  g.fill();
  g.drawImage(head, -44, hy - 44, 88, 88);
  g.restore();
  // bảng tên
  label(g, name, x, y - (262 + bob) * s, `hsl(${hue},80%,60%)`);
}

export function label(g: G, text: string, x: number, y: number, color: string) {
  g.save();
  g.font = "700 26px 'Chakra Petch', sans-serif";
  const w = Math.min(260, g.measureText(text).width) + 22;
  g.fillStyle = "rgba(5,8,20,0.82)";
  g.beginPath();
  g.roundRect(x - w / 2, y - 20, w, 36, 18);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, x, y - 1, 240);
  g.restore();
}

function alien(g: G, x: number, y: number, s: number, t: number) {
  const bob = Math.sin(t * 3) * 5;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.ellipse(0, 0, 40, 10, 0, 0, TAU);
  g.fill();
  g.fillStyle = "#6bdc7a";
  g.beginPath();
  g.ellipse(0, -60 + bob / 2, 30, 50, 0, 0, TAU);
  g.fill();
  // đầu to
  g.beginPath();
  g.ellipse(0, -150 + bob, 62, 54, 0, 0, TAU);
  g.fill();
  // ăng-ten
  g.strokeStyle = "#6bdc7a";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(-20, -198 + bob);
  g.lineTo(-34, -236 + bob);
  g.moveTo(20, -198 + bob);
  g.lineTo(34, -236 + bob);
  g.stroke();
  g.fillStyle = Math.sin(t * 5) > 0 ? "#fff36b" : "#ff6fae";
  g.beginPath();
  g.arc(-34, -238 + bob, 7, 0, TAU);
  g.arc(34, -238 + bob, 7, 0, TAU);
  g.fill();
  // mắt to như bát
  const blink = Math.sin(t * 1.3) > 0.97 ? 0.15 : 1;
  for (const dx of [-24, 24]) {
    g.fillStyle = "#0b0b18";
    g.beginPath();
    g.ellipse(dx, -150 + bob, 20, 26 * blink, dx < 0 ? 0.3 : -0.3, 0, TAU);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(dx + 6, -160 + bob, 6 * blink, 0, TAU);
    g.fill();
  }
  g.restore();
  label(g, "Bíp 👽", x, y - (262 - bob) * s, "#6bdc7a");
}

function grandma(g: G, x: number, y: number, s: number, t: number, ghost: boolean) {
  const float = ghost ? Math.sin(t * 1.8) * 10 - 20 : 0;
  g.save();
  g.translate(x, y + float);
  g.scale(s, s);
  g.globalAlpha = ghost ? 0.55 + 0.15 * Math.sin(t * 2.4) : 1;
  if (ghost) {
    const halo = g.createRadialGradient(0, -120, 10, 0, -120, 170);
    halo.addColorStop(0, "rgba(180,220,255,0.35)");
    halo.addColorStop(1, "rgba(180,220,255,0)");
    g.fillStyle = halo;
    g.fillRect(-170, -290, 340, 340);
  }
  // áo bà ba
  g.fillStyle = ghost ? "#cfe3ff" : "#8a5a9e";
  g.beginPath();
  g.moveTo(-40, -150);
  g.quadraticCurveTo(0, -168, 40, -150);
  if (ghost) {
    // đuôi ma
    for (let i = 0; i <= 4; i++) g.lineTo(40 - i * 20, -10 + (i % 2) * 18 + Math.sin(t * 4 + i) * 6);
  } else {
    g.lineTo(44, -10);
    g.lineTo(-44, -10);
  }
  g.closePath();
  g.fill();
  // mặt
  g.fillStyle = ghost ? "#eef5ff" : "#f2cfae";
  g.beginPath();
  g.arc(0, -200, 40, 0, TAU);
  g.fill();
  // tóc bạc búi
  g.fillStyle = "#e6e6ee";
  g.beginPath();
  g.arc(0, -222, 38, Math.PI, 0);
  g.arc(0, -252, 16, 0, TAU);
  g.fill();
  g.fillStyle = "#333";
  g.beginPath();
  g.arc(-14, -200, 4, 0, TAU);
  g.arc(14, -200, 4, 0, TAU);
  g.fill();
  g.strokeStyle = "#7a3b3b";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, -188, 10, 0.2, Math.PI - 0.2);
  g.stroke();
  // cái muôi
  g.strokeStyle = "#999";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(44, -120);
  g.lineTo(78, -190 + Math.sin(t * 3) * 6);
  g.stroke();
  g.restore();
  label(g, ghost ? "Bà Ma 👻" : "Bà Cụ 👵", x, y + float - 290 * s, ghost ? "#bcd8ff" : "#d59cf0");
}

function cat(g: G, x: number, y: number, s: number, t: number) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = "#111";
  g.beginPath();
  g.ellipse(0, -40, 40, 36, 0, 0, TAU);
  g.fill();
  g.beginPath();
  g.arc(0, -96, 30, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(-26, -112);
  g.lineTo(-18, -146);
  g.lineTo(-4, -120);
  g.moveTo(26, -112);
  g.lineTo(18, -146);
  g.lineTo(4, -120);
  g.fill();
  g.strokeStyle = "#111";
  g.lineWidth = 10;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(36, -24);
  g.quadraticCurveTo(80, -40 + Math.sin(t * 2) * 20, 70, -100);
  g.stroke();
  const blink = Math.sin(t * 0.9) > 0.96 ? 0.1 : 1;
  g.fillStyle = "#ffd23d";
  for (const dx of [-11, 11]) {
    g.beginPath();
    g.ellipse(dx, -98, 7, 9 * blink, 0, 0, TAU);
    g.fill();
  }
  g.fillStyle = "#000";
  g.fillRect(-12, -104, 2, 12 * blink);
  g.fillRect(10, -104, 2, 12 * blink);
  g.restore();
  label(g, "Mèo Đen 🐈‍⬛", x, y - 180 * s, "#ffd23d");
}

function crowd(g: G, x: number, y: number, s: number, t: number) {
  for (let i = 0; i < 9; i++) {
    const px = x + (i - 4) * 70 * s;
    const jump = Math.abs(Math.sin(t * 6 + i)) * 14;
    g.fillStyle = `hsl(${(i * 47) % 360},40%,${18 + (i % 3) * 5}%)`;
    g.beginPath();
    g.arc(px, y - 120 * s - jump, 26 * s, 0, TAU);
    g.fill();
    g.fillRect(px - 26 * s, y - 100 * s - jump, 52 * s, 100 * s);
    // nồi niêu xoong chảo
    g.fillStyle = "#9aa0aa";
    g.beginPath();
    g.ellipse(px + 30 * s, y - 170 * s - jump * 1.5, 18 * s, 6 * s, Math.sin(t * 8 + i), 0, TAU);
    g.fill();
  }
}

export interface CastMember {
  name: string;
  hue: number;
  head: CanvasImageSource;
}

/** Xếp diễn viên theo hàng ngang trên khung phim */
export function drawCast(g: G, cast: Actor[], t: number, hero: CastMember, friend: CastMember, scared: boolean) {
  const n = cast.length;
  cast.forEach((a, i) => {
    const x = FW * ((i + 1) / (n + 1)) + Math.sin(t * 0.5 + i) * 6;
    const y = FLOOR + 18;
    const s = 0.82;
    if (a === "hero") drawPerson(g, x, y, s, hero.hue, hero.head, t, hero.name, scared);
    else if (a === "friend") drawPerson(g, x, y, s * 0.94, friend.hue, friend.head, t + 1.3, friend.name, scared);
    else if (a === "alien") alien(g, x, y, s, t);
    else if (a === "grandma") grandma(g, x, y, s, t, false);
    else if (a === "ghost") grandma(g, x, y, s, t, true);
    else if (a === "cat") cat(g, x, y, s, t);
    else crowd(g, x, y, s, t);
  });
}
