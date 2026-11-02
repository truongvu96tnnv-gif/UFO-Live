import { approach, clamp, mulberry32, rand } from "./math";
import { canvas, type Img, type Tower } from "./sprites";
import { H, W } from "./stage";

/**
 * Không khí chiến trường (theo bộ mockup): mây khói trôi quanh UFO, khói phủ mái nhà, đám cháy trên mái,
 * tháp pháo phòng không bắn đạn vạch đường lên trời, tàn lửa bay lên. Thuần trang trí — không gây sát thương.
 */

interface Cloud {
  img: Img;
  x: number;
  y: number;
  s: number;
  v: number;
  a: number;
}

interface Turret {
  x: number;
  y: number;
  ang: number;
  cd: number;
  flash: number;
  side: number;
}

interface Tracer {
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
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

export interface SceneTarget {
  x: number;
  y: number;
  rx: number;
  ry: number;
  alive: boolean;
  fighting: boolean;
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
  private turrets: Turret[] = [];
  private fires: { x: number; y: number; p: number }[] = [];
  private tracers: Tracer[] = [];
  private puffs: Puff[] = [];
  private embers: Ember[] = [];
  private bursts: { x: number; y: number; t: number }[] = [];
  private heat = 0;
  private time = 0;

  constructor(towers: Tower[], private glows: Img[], private onFire?: (x: number) => void) {
    const rnd = mulberry32(2025);
    const sky = [0, 1, 2, 3].map((i) => makeCloud(100 + i, 720, 300, [150, 160, 190], [40, 46, 66]));
    const smoke = [0, 1, 2].map((i) => makeCloud(200 + i, 720, 280, [120, 120, 130], [30, 30, 36]));
    for (let i = 0; i < 8; i++) {
      this.back.push({ img: sky[i % sky.length], x: rand(-700, W), y: 460 + rnd() * 520, s: 0.9 + rnd() * 0.8, v: 5 + rnd() * 10, a: 0.22 + rnd() * 0.22 });
    }
    for (let i = 0; i < 7; i++) {
      this.city.push({ img: smoke[i % smoke.length], x: rand(-700, W), y: 1270 + rnd() * 200, s: 0.8 + rnd() * 0.7, v: 8 + rnd() * 14, a: 0.28 + rnd() * 0.2 });
    }
    // tháp pháo trên các nóc nhà gần 4 vị trí rải đều (tránh giữa màn — chỗ tia hút & bong bóng)
    const used = new Set<Tower>();
    [100, 300, 780, 980].forEach((px, i) => {
      let best: Tower | null = null;
      for (const t of towers) {
        if (used.has(t)) continue;
        const d = Math.abs(t.x + t.w / 2 - px);
        if (!best || d < Math.abs(best.x + best.w / 2 - px)) best = t;
      }
      if (best) {
        used.add(best);
        this.turrets.push({ x: best.x + best.w / 2, y: best.top, ang: -Math.PI / 2, cd: rnd() * 2, flash: 0, side: i < 2 ? 1 : -1 });
      }
    });
    // vài đám cháy trên mái
    for (const t of towers.filter((t) => !used.has(t)).sort(() => rnd() - 0.5).slice(0, 3)) {
      this.fires.push({ x: t.x + t.w * (0.3 + rnd() * 0.4), y: t.top + 4, p: rnd() * 6 });
    }
  }

  /** Mỗi phát bắn của người xem làm tháp pháo bắn hăng hơn */
  pulse(k = 1) {
    this.heat = Math.min(1, this.heat + 0.04 * k);
  }

  update(dt: number, tg: SceneTarget) {
    this.time += dt;
    this.heat = approach(this.heat, 0, 0.6, dt);
    for (const c of [...this.back, ...this.city]) {
      c.x += c.v * dt;
      if (c.x > W + 40) c.x = -c.img.width * c.s - rand(0, 200);
    }
    // tháp pháo: xoay nòng theo UFO, bắn loạt đạn vạch đường
    for (const t of this.turrets) {
      const want = tg.alive ? Math.atan2(tg.y - t.y, tg.x - t.x) : -Math.PI / 2 + t.side * 0.4 * Math.sin(this.time * 0.5 + t.x);
      t.ang = approach(t.ang, clamp(want, -Math.PI + 0.25, -0.25), 4, dt);
      t.flash = Math.max(0, t.flash - dt * 8);
      t.cd -= dt;
      if (tg.alive && tg.fighting && t.cd <= 0) {
        t.cd = 0.18 + (1 - this.heat) * rand(0.6, 1.6);
        const tipx = t.x + Math.cos(t.ang) * 70;
        const tipy = t.y - 27 + Math.sin(t.ang) * 70;
        const tx = tg.x + rand(-1.1, 1.1) * tg.rx;
        const ty = tg.y + rand(-1.4, 1.2) * tg.ry;
        this.tracers.push({ x: tipx, y: tipy, tx, ty, t: 0, dur: Math.hypot(tx - tipx, ty - tipy) / 2400 });
        t.flash = 1;
        this.onFire?.(t.x);
        this.puffs.push({ x: tipx, y: tipy, vx: rand(-15, 15), vy: rand(-40, -20), r: 10, life: 0, max: 1.4, dark: 0.4 });
      }
      // khói bốc từ tháp pháo
      if (Math.random() < dt * (1.5 + this.heat * 4)) this.puffs.push({ x: t.x + rand(-10, 10), y: t.y - 14, vx: rand(-8, 8) + 10, vy: rand(-55, -35), r: 12, life: 0, max: rand(3, 4.5), dark: 0.75 });
    }
    for (const f of this.fires) {
      if (Math.random() < dt * 3) this.puffs.push({ x: f.x + rand(-8, 8), y: f.y - 10, vx: rand(-6, 6) + 12, vy: rand(-60, -40), r: 14, life: 0, max: rand(3.5, 5.5), dark: 0.85 });
      if (Math.random() < dt * 4) this.embers.push({ x: f.x + rand(-10, 10), y: f.y - 10, vx: rand(-20, 20), vy: rand(-90, -40), life: 0, max: rand(3, 6), s: rand(1.5, 3.5) });
    }
    if (Math.random() < dt * 3) this.embers.push({ x: rand(0, W), y: H - rand(0, 300), vx: rand(-15, 15), vy: rand(-70, -30), life: 0, max: rand(4, 8), s: rand(1.5, 3) });
    for (const tr of this.tracers) {
      tr.t += dt;
      if (tr.t >= tr.dur) this.bursts.push({ x: tr.tx, y: tr.ty, t: this.time });
    }
    this.tracers = this.tracers.filter((tr) => tr.t < tr.dur);
    for (const b of this.bursts) {
      if (this.time - b.t < dt * 1.5) this.puffs.push({ x: b.x, y: b.y, vx: rand(-10, 10), vy: rand(-10, 5), r: 14, life: 0, max: 1.6, dark: 0.55 });
    }
    this.bursts = this.bursts.filter((b) => this.time - b.t < 0.35);
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

  /** Lớp sau: mây trên trời, khói phủ mái nhà, đám cháy, tháp pháo & khói của chúng */
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
    // khói (sau tháp pháo để nòng súng nổi lên)
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
    // tháp pháo vẽ trên lớp khói cho nổi
    for (const t of this.turrets) this.drawTurret(ctx, t);
  }

  private drawTurret(ctx: CanvasRenderingContext2D, t: Turret) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(1.5, 1.5);
    // bệ
    const base = ctx.createLinearGradient(0, -24, 0, 2);
    base.addColorStop(0, "#5b616d");
    base.addColorStop(1, "#1d2027");
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.moveTo(-32, 2);
    ctx.lineTo(-24, -16);
    ctx.lineTo(24, -16);
    ctx.lineTo(32, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffb15a";
    ctx.fillRect(-18, -8, 36, 2);
    // nòng đôi
    ctx.translate(0, -18);
    ctx.rotate(t.ang);
    const recoil = t.flash * 6;
    ctx.fillStyle = "#2b2f37";
    ctx.fillRect(4 - recoil, -9, 46, 6);
    ctx.fillRect(4 - recoil, 3, 46, 6);
    ctx.fillStyle = "#6c7380";
    ctx.fillRect(4 - recoil, -9, 46, 2);
    ctx.fillRect(4 - recoil, 3, 46, 2);
    const hub = ctx.createRadialGradient(-4, -5, 2, 0, 0, 15);
    hub.addColorStop(0, "#9aa2b0");
    hub.addColorStop(1, "#2e323b");
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    if (t.flash > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = t.flash;
      ctx.drawImage(this.glows[0], 36, -26, 52, 52);
    }
    ctx.restore();
  }

  /** Lớp trước: đạn vạch đường, chớp nổ flak quanh UFO, tàn lửa bay */
  drawFront(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const tr of this.tracers) {
      const u = tr.t / tr.dur;
      const x = tr.x + (tr.tx - tr.x) * u;
      const y = tr.y + (tr.ty - tr.y) * u;
      const dx = (tr.tx - tr.x) / Math.hypot(tr.tx - tr.x, tr.ty - tr.y);
      const dy = (tr.ty - tr.y) / Math.hypot(tr.tx - tr.x, tr.ty - tr.y);
      ctx.strokeStyle = "rgba(255,190,90,0.35)";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x - dx * 70, y - dy * 70);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,240,200,0.95)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    for (const b of this.bursts) {
      const k = 1 - (this.time - b.t) / 0.35;
      ctx.globalAlpha = k;
      ctx.drawImage(this.glows[0], b.x - 30, b.y - 30, 60, 60);
    }
    for (const e of this.embers) {
      const k = e.life / e.max;
      ctx.globalAlpha = Math.sin(Math.PI * k) * (0.6 + 0.4 * Math.sin(this.time * 12 + e.x));
      ctx.drawImage(this.glows[1], e.x - e.s * 3, e.y - e.s * 3, e.s * 6, e.s * 6);
    }
    ctx.restore();
  }
}
