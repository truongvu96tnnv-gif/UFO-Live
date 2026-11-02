import { clamp, mulberry32, rand } from "./math";
import { canvas, type Img, type Tower } from "./sprites";
import { H, W } from "./stage";

/**
 * Không khí chiến trường (theo bộ mockup): mây khói trôi quanh UFO, khói phủ mái nhà, đám cháy trên mái,
 * tàn lửa bay lên. Thuần trang trí — không gây sát thương.
 */

interface Cloud {
  img: Img;
  x: number;
  y: number;
  s: number;
  v: number;
  a: number;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  dark: number;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s: number;
}

/** Đám mây mềm: nhiều quầng tròn chồng lên nhau, mép trên sáng ánh trăng, đáy tối */
function makeCloud(seed: number, w: number, h: number, light: [number, number, number], dark: [number, number, number]): Img {
  const [c, g] = canvas(w, h);
  const rnd = mulberry32(seed);
  g.filter = "blur(10px)";
  for (let i = 0; i < 46; i++) {
    const x = w * (0.12 + rnd() * 0.76);
    const y = h * (0.35 + rnd() * 0.4) - Math.sin(((x / w) * Math.PI)) * h * 0.18;
    const r = h * (0.16 + rnd() * 0.22);
    const k = clamp((y - h * 0.2) / (h * 0.7), 0, 1);
    const col = light.map((v, j) => Math.round(v + (dark[j] - v) * k));
    const grad = g.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
    grad.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.55 + rnd() * 0.3})`);
    grad.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export class Scene {
  private back: Cloud[] = [];
  private city: Cloud[] = [];
  private fires: { x: number; y: number; p: number }[] = [];
  private puffs: Puff[] = [];
  private embers: Ember[] = [];
  private time = 0;

  constructor(towers: Tower[], private glows: Img[]) {
    const rnd = mulberry32(2025);
    const sky = [0, 1, 2, 3].map((i) => makeCloud(100 + i, 720, 300, [150, 160, 190], [40, 46, 66]));
    const smoke = [0, 1, 2].map((i) => makeCloud(200 + i, 720, 280, [120, 120, 130], [30, 30, 36]));
    for (let i = 0; i < 8; i++) {
      this.back.push({ img: sky[i % sky.length], x: rand(-700, W), y: 460 + rnd() * 520, s: 0.9 + rnd() * 0.8, v: 5 + rnd() * 10, a: 0.22 + rnd() * 0.22 });
    }
    for (let i = 0; i < 7; i++) {
      this.city.push({ img: smoke[i % smoke.length], x: rand(-700, W), y: 1270 + rnd() * 200, s: 0.8 + rnd() * 0.7, v: 8 + rnd() * 14, a: 0.28 + rnd() * 0.2 });
    }
    // vài đám cháy trên mái
    for (const t of [...towers].sort(() => rnd() - 0.5).slice(0, 3)) {
      this.fires.push({ x: t.x + t.w * (0.3 + rnd() * 0.4), y: t.top + 4, p: rnd() * 6 });
    }
  }

  update(dt: number) {
    this.time += dt;
    for (const c of [...this.back, ...this.city]) {
      c.x += c.v * dt;
      if (c.x > W + 40) c.x = -c.img.width * c.s - rand(0, 200);
    }
    for (const f of this.fires) {
      if (Math.random() < dt * 3) this.puffs.push({ x: f.x + rand(-8, 8), y: f.y - 10, vx: rand(-6, 6) + 12, vy: rand(-60, -40), r: 14, life: 0, max: rand(3.5, 5.5), dark: 0.85 });
      if (Math.random() < dt * 4) this.embers.push({ x: f.x + rand(-10, 10), y: f.y - 10, vx: rand(-20, 20), vy: rand(-90, -40), life: 0, max: rand(3, 6), s: rand(1.5, 3.5) });
    }
    if (Math.random() < dt * 3) this.embers.push({ x: rand(0, W), y: H - rand(0, 300), vx: rand(-15, 15), vy: rand(-70, -30), life: 0, max: rand(4, 8), s: rand(1.5, 3) });
    for (const p of this.puffs) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += dt * 16;
    }
    this.puffs = this.puffs.filter((p) => p.life < p.max);
    if (this.puffs.length > 260) this.puffs.splice(0, this.puffs.length - 260);
    for (const e of this.embers) {
      e.life += dt;
      e.vx += Math.sin(this.time * 2 + e.y * 0.01) * 20 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    this.embers = this.embers.filter((e) => e.life < e.max && e.y > -20);
    if (this.embers.length > 120) this.embers.splice(0, this.embers.length - 120);
  }

  /** Lớp sau: mây trên trời, khói phủ mái nhà, đám cháy */
  drawBack(ctx: CanvasRenderingContext2D) {
    for (const c of this.back) {
      ctx.globalAlpha = c.a;
      ctx.drawImage(c.img, c.x, c.y - (c.img.height * c.s) / 2, c.img.width * c.s, c.img.height * c.s);
    }
    ctx.globalAlpha = 1;
    // đám cháy trên mái
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const f of this.fires) {
      const k = 0.7 + 0.3 * Math.sin(this.time * 9 + f.p) * Math.sin(this.time * 5.3 + f.p);
      ctx.globalAlpha = k;
      ctx.drawImage(this.glows[1], f.x - 40, f.y - 50, 80, 70);
      ctx.drawImage(this.glows[0], f.x - 18, f.y - 30, 36, 36);
    }
    ctx.restore();
    // khói trên mái nhà
    for (const p of this.puffs) {
      const k = p.life / p.max;
      const v = Math.round(70 - 40 * p.dark);
      ctx.fillStyle = `rgba(${v},${v},${v + 6},${(1 - k) * 0.42})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of this.city) {
      ctx.globalAlpha = c.a;
      ctx.drawImage(c.img, c.x, c.y - (c.img.height * c.s) / 2, c.img.width * c.s, c.img.height * c.s);
    }
    ctx.globalAlpha = 1;
  }

  /** Lớp trước: tàn lửa bay */
  drawFront(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const e of this.embers) {
      const k = e.life / e.max;
      ctx.globalAlpha = Math.sin(Math.PI * k) * (0.6 + 0.4 * Math.sin(this.time * 12 + e.x));
      ctx.drawImage(this.glows[1], e.x - e.s * 3, e.y - e.s * 3, e.s * 6, e.s * 6);
    }
    ctx.restore();
  }
}
