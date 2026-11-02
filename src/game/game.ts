import type { LiveEvent, LiveUser } from "../live/events";
import { Avatars } from "./avatars";
import { giftTier, TIER_CAP, TIER_LABEL, type Balance } from "./balance";
import { approach, clamp, easeInOutCubic, easeOutBack, lerp, pick, rand } from "./math";
import { Sfx } from "./sfx";
import {
  BELLY_Y,
  DISC_RX,
  DISC_RY,
  makeBackground,
  makeBubble,
  makeGlow,
  makeSaucer,
  makeStar,
  SCX,
  SCY,
  type Img,
  type Tower,
} from "./sprites";
import { CX, GROUND_Y, H, PEOPLE_Y0, PEOPLE_Y1, SAFE, UFO_LAND_Y, UFO_SCALE, UFO_START_Y, W } from "./stage";

/**
 * BẢO VỆ TRÁI ĐẤT — game tương tác TikTok Live.
 *
 *  intro  — còi báo động, UFO xâm lược lao vào từ góc trên, thanh máu nạp đầy.
 *  battle — UFO hạ dần xuống thành phố. Người xem bắn hạ nó:
 *             ❤️ tim = laser · 💬 bình luận = tên lửa · 🎁 quà = vũ khí hạng nặng (theo số kim cương)
 *             ➕ follow / ↗ chia sẻ = đẩy UFO lùi lên.
 *           Mỗi người tương tác có 1 bong bóng mang ảnh đại diện lơ lửng trên mái nhà — đạn bắn ra từ chính bong bóng đó.
 *  win    — hết máu: slow-motion, nổ dây chuyền, nổ lớn, pháo hoa; vinh danh người ra đòn kết liễu + top xạ thủ.
 *  lose   — chạm đất: tia hút xanh bật, cả hội trường bị hút xoắn ốc vào bụng đĩa — "CẢ LIVE ĐÃ BỊ BẮT CÓC".
 *  break  — mọi người được thả về, đếm ngược vòng sau. Độ khó tự cân bằng (thắng → máu UFO tăng, thua → giảm).
 */

export type Phase = "intro" | "battle" | "win" | "lose" | "break";

const INTRO_T = 3.6;
const WIN_T = 10.5;
const LOSE_T = 9;
const BREAK_T = 6.5;
const MAX_PEOPLE = 30;
const BUBBLE_R = 47;
const S = UFO_SCALE;
const FIREWORK = ["#ffd55a", "#ff5a6e", "#5ad1ff", "#9dff7a", "#ffffff", "#ff9a3d", "#d58bff"];
const TIPS = [
  "❤️ THẢ TIM = BẮN LASER",
  "💬 BÌNH LUẬN = PHÓNG TÊN LỬA",
  "🎁 TẶNG QUÀ = VŨ KHÍ HẠNG NẶNG",
  "➕ FOLLOW / CHIA SẺ = ĐẨY UFO LÙI",
];

interface Person {
  user: LiveUser;
  x0: number;
  y0: number;
  z: number;
  v: number;
  p: number;
  born: number;
  pulse: number;
  seen: number;
  suck: number; // lúc bắt đầu bị hút (-1 = không)
  say: string;
  sayT: number;
}

type ShotKind = "laser" | "rocket" | "heavy" | "mega";
interface Shot {
  kind: ShotKind;
  user: LiveUser;
  sx: number;
  sy: number;
  ox: number; // điểm trúng trên thân đĩa (so với tâm)
  oy: number;
  t0: number;
  dur: number;
  dmg: number;
  side: number;
  color: string;
  trail: { x: number; y: number; t: number }[];
  done: boolean;
}

interface Cannon {
  user: LiveUser;
  x: number;
  t0: number;
  dur: number;
  dmg: number;
  dealt: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  sprite: number;
  drag: number;
  gravity: number;
}

interface Streak {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Blast {
  x: number;
  y: number;
  t: number;
  color: string;
  size: number;
}

interface Smoke {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  life: number;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
  size: number;
}

interface Banner {
  title: string;
  sub: string;
  user?: LiveUser;
  color: string;
  dur: number;
  prio: number;
  t: number; // lúc bắt đầu hiện (-1 = đang chờ)
}

export class Game {
  // tài nguyên
  private bg: Img;
  private towers: Tower[];
  private saucer = makeSaucer();
  private goldSaucer = makeSaucer("rgba(255,196,70,0.5)");
  private bubbleFx = [205, 320, 40, 150].map(makeBubble);
  /** 0 vàng · 1 đỏ cam · 2 trắng xanh · 3 sao · 4 xanh lá (tia hút) */
  private glows = [makeGlow(255, 200, 90), makeGlow(255, 90, 50), makeGlow(200, 230, 255), makeStar(), makeGlow(120, 255, 160)];
  readonly avatars = new Avatars();
  readonly sfx = new Sfx();

  // nhịp
  private time = 0;
  private timeScale = 1;
  phase: Phase = "break";
  private phaseT = BREAK_T - 1.2;
  private once = new Set<string>();

  // vòng chơi
  round = 0;
  earthWins = 0;
  ufoWins = 0;
  private diffMul = 1;
  boss = false;
  hp = 0;
  hpMax = 1;
  private hpShown = 0;
  private hpTrail = 0;
  /** tiến độ hạ xuống 0..1 (1 = chạm đất) */
  progress = 0;
  private ufoAlive = false;
  private ux = W + 400;
  private uy = -300;
  private tilt = 0;
  private kick = 0; // giật lên khi bị đẩy lùi
  private hitFlash = 0;
  private shake = 0;
  private beam = 0;
  private beamWant = 0;
  private shield = 0;
  private alarmAt = 0;
  private flash = 0;

  // người xem
  private people: Person[] = [];
  private active = new Map<string, number>();
  private chatCd = new Map<string, number>();
  private roundDmg = new Map<string, { user: LiveUser; dmg: number }>();
  private killer: LiveUser | null = null;
  private lastHitter: LiveUser | null = null;
  private abducted = 0;

  // hiệu ứng
  private shots: Shot[] = [];
  private cannons: Cannon[] = [];
  private parts: Particle[] = [];
  private streaks: Streak[] = [];
  private blasts: Blast[] = [];
  private smoke: Smoke[] = [];
  private debris: Debris[] = [];
  private floaters: Floater[] = [];
  private banners: Banner[] = [];
  private nextFirework = 0;

  status = "";
  demo = false;

  constructor(private bal: Balance) {
    const bg = makeBackground();
    this.bg = bg.img;
    this.towers = bg.towers;
  }

  // ================= điều khiển =================

  /** Bắt đầu lại từ đầu (phím R) */
  restart() {
    this.earthWins = 0;
    this.ufoWins = 0;
    this.round = 0;
    this.diffMul = 1;
    this.startRound();
  }

  /** Vòng tiếp theo là UFO VÀNG (phím B) */
  private bossNext = false;
  forceBoss() {
    this.bossNext = true;
    this.toast("Vòng sau: UFO VÀNG xuất hiện!", "", "#ffd55a");
  }

  /** Nhảy thẳng tới 1 pha (dùng để thử) */
  debugPhase(p: Phase) {
    if (p === "battle" && this.phase !== "battle") {
      this.startRound();
      this.ux = CX;
      this.uy = UFO_START_Y;
      this.setPhase("battle");
    } else if (p === "win") {
      if (!this.ufoAlive) this.debugPhase("battle");
      this.hp = 0;
      this.killer = this.lastHitter ?? this.people[0]?.user ?? null;
      this.endRound(true);
    } else if (p === "lose") {
      if (!this.ufoAlive) this.debugPhase("battle");
      this.endRound(false);
    } else this.setPhase(p);
  }

  /** Nhảy tiến độ hạ (để thử cảnh báo) */
  debugProgress(p: number) {
    this.progress = clamp(p, 0, 0.999);
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
    this.once.clear();
  }

  private at(key: string, t: number) {
    if (this.phaseT >= t && !this.once.has(key)) {
      this.once.add(key);
      return true;
    }
    return false;
  }

  private activeCount() {
    const now = this.time;
    let n = 0;
    for (const [id, t] of this.active) {
      if (now - t < 120) n++;
      else this.active.delete(id);
    }
    return n;
  }

  private startRound() {
    this.round++;
    this.boss = this.bossNext || Math.random() < this.bal.bossChance || this.round % 10 === 0;
    this.bossNext = false;
    const viewers = this.activeCount();
    this.hpMax = Math.max(50, Math.round((this.bal.hpBase + this.bal.hpPerViewer * viewers) * this.diffMul * (this.boss ? 2.2 : 1)));
    this.hp = this.hpMax;
    this.hpShown = 0;
    this.hpTrail = 0;
    this.progress = 0;
    this.roundDmg.clear();
    this.killer = null;
    this.lastHitter = null;
    this.ufoAlive = true;
    this.ux = W + 420;
    this.uy = -300;
    this.kick = 0;
    this.beamWant = 0;
    this.timeScale = 1;
    this.setPhase("intro");
    this.sfx.siren();
  }

  private endRound(win: boolean) {
    if (this.phase !== "battle" && this.phase !== "intro") return;
    for (const c of this.cannons) c.dur = 0;
    if (win) {
      this.earthWins++;
      this.diffMul = clamp(this.diffMul * 1.18, 0.45, 6);
      this.setPhase("win");
      this.timeScale = 0.3;
      this.sfx.hit(true);
    } else {
      this.ufoWins++;
      this.diffMul = clamp(this.diffMul * 0.8, 0.45, 6);
      this.setPhase("lose");
      // hút từ người gần đĩa ra xa
      const order = this.people
        .map((p) => {
          const [x, y] = this.personPos(p);
          return [Math.hypot(x - CX, y - UFO_LAND_Y), p] as const;
        })
        .sort((a, b) => a[0] - b[0]);
      const spread = Math.min(0.12, 2.6 / Math.max(1, order.length));
      order.forEach(([, p], i) => (p.suck = this.time + 0.9 + i * spread));
      this.abducted = order.length;
      this.sfx.lose();
    }
  }

  // ================= sự kiện live =================

  handle(e: LiveEvent) {
    if (e.type === "status") {
      this.status = e.state === "connected" || e.state === "idle" ? "" : `${e.state}${e.detail ? ": " + e.detail : ""}`;
      return;
    }
    const user = e.user;
    this.active.set(user.id, this.time);
    const person = this.ensurePerson(user);
    person.seen = this.time;
    person.pulse = 1;
    const fighting = this.phase === "battle" && this.ufoAlive && this.hp > 0;

    switch (e.type) {
      case "join":
        break;
      case "like": {
        const dmg = Math.max(1, e.count) * this.bal.likeDmg;
        if (fighting) this.fire("laser", user, dmg);
        else this.sparks(...this.personPos(person), 3, 160);
        break;
      }
      case "chat": {
        const text = e.text.trim();
        if (text) {
          person.say = [...text].slice(0, 22).join("") + (text.length > 22 ? "…" : "");
          person.sayT = this.time;
        }
        const cd = this.chatCd.get(user.id) ?? -99;
        if (this.time - cd < this.bal.chatCooldown) break;
        this.chatCd.set(user.id, this.time);
        if (fighting) this.fire("rocket", user, this.bal.chatDmg);
        break;
      }
      case "gift": {
        const total = Math.max(1, e.diamonds) * Math.max(1, e.count);
        const tier = giftTier(total);
        const dmg = Math.min(total * this.bal.giftDmg, Math.max(this.bal.giftDmg, this.hpMax * TIER_CAP[tier]));
        const gift = e.count > 1 ? `${e.gift} ×${e.count}` : e.gift;
        if (fighting) {
          if (tier === "rocket") {
            const n = Math.min(8, Math.max(1, e.count));
            for (let i = 0; i < n; i++) this.fire("rocket", user, dmg / n, i * 0.09);
            this.floatText(`${user.name}: ${gift}`, ...this.personPos(person), "#ffd55a", 30);
          } else if (tier === "heavy") {
            this.fire("heavy", user, dmg);
          } else if (tier === "mega") {
            for (let i = 0; i < 3; i++) this.fire("mega", user, dmg / 3, i * 0.18);
            this.shake = Math.max(this.shake, 10);
          } else {
            const [x] = this.personPos(person);
            this.cannons.push({ user, x, t0: this.time, dur: 2.6, dmg, dealt: 0 });
            this.shake = Math.max(this.shake, 18);
            this.sfx.launch();
          }
          if (tier !== "rocket") this.toast(`${user.name} phóng ${TIER_LABEL[tier]}!`, `${gift} · −${fmt(dmg)} máu UFO`, tier === "cannon" ? "#ff5a6e" : "#ffd55a", user, tier === "cannon" ? 3 : 2);
        } else {
          // ngoài trận: quà thành pháo hoa ăn mừng
          const n = tier === "rocket" ? 1 : tier === "heavy" ? 2 : tier === "mega" ? 4 : 8;
          for (let i = 0; i < n; i++) this.firework(rand(160, 920), rand(520, 950), pick(FIREWORK));
          if (tier !== "rocket") this.toast(`Cảm ơn ${user.name}!`, gift, "#ffd55a", user, 1);
        }
        break;
      }
      case "follow":
        this.pushBack(user, this.bal.followPush, "dựng lá chắn");
        break;
      case "share":
        this.pushBack(user, this.bal.sharePush, "gọi viện binh");
        break;
    }
  }

  private pushBack(user: LiveUser, amount: number, what: string) {
    if (this.phase === "battle" && this.ufoAlive) {
      this.progress = Math.max(0, this.progress - amount);
      this.kick += 70;
      this.shield = 1;
      this.sfx.push();
      this.toast(`${user.name} ${what}!`, `UFO bị đẩy lùi ▲${Math.round(amount * 100)} km`, "#5ad1ff", user, 1);
    } else this.toast(`${user.name} ${what}!`, "Cảm ơn bạn ❤️", "#5ad1ff", user, 0);
  }

  private ensurePerson(user: LiveUser): Person {
    const hit = this.people.find((p) => p.user.id === user.id);
    if (hit) {
      hit.user = user;
      return hit;
    }
    if (this.people.length >= MAX_PEOPLE) {
      // nhường chỗ cho người mới: bỏ người lâu không tương tác nhất (không động vào ai đang bị hút)
      let old = -1;
      for (let i = 0; i < this.people.length; i++) {
        if (this.people[i].suck >= 0) continue;
        if (old < 0 || this.people[i].seen < this.people[old].seen) old = i;
      }
      if (old >= 0) this.people.splice(old, 1);
    }
    const z = 0.62 + Math.random() * 0.42;
    const p: Person = {
      user,
      x0: Math.random() * (W + 240),
      y0: PEOPLE_Y0 + (z - 0.62) * 360 + Math.random() * 60,
      z,
      v: (10 + 22 * z) * (Math.random() < 0.5 ? 1 : -1),
      p: Math.random() * 6.28,
      born: this.time,
      pulse: 1,
      seen: this.time,
      suck: this.phase === "lose" ? this.time : -1,
      say: "",
      sayT: -99,
    };
    this.people.push(p);
    this.people.sort((a, b) => a.z - b.z);
    this.sparks(...this.personPos(p), 6, 220);
    return p;
  }

  private personPos(p: Person): [number, number] {
    const span = W + 240;
    const x = ((((p.x0 + p.v * this.time) % span) + span) % span) - 120;
    const y = Math.min(PEOPLE_Y1 + 40, p.y0 + Math.sin(this.time * 0.8 + p.p) * 10);
    return [x, y];
  }

  private originFor(user: LiveUser): [number, number] {
    const p = this.people.find((q) => q.user.id === user.id && q.suck < 0);
    if (p) {
      const [x, y] = this.personPos(p);
      if (x > -40 && x < W + 40) return [clamp(x, 30, W - 30), y - BUBBLE_R * p.z];
    }
    const t = pick(this.towers);
    return [clamp(t.x + t.w / 2, 40, W - 40), Math.max(GROUND_Y - 40, t.top)];
  }

  private fire(kind: ShotKind, user: LiveUser, dmg: number, delay = 0) {
    // quá nhiều đạn trên màn → cộng sát thương thẳng, không vẽ thêm (giữ FPS lúc mưa tim)
    if (this.shots.length > 140 && kind === "laser") {
      this.damage(user, dmg, this.ux + rand(-120, 120), this.uy, false);
      return;
    }
    const [sx, sy] = this.originFor(user);
    const hue = this.avatars.hue(user);
    this.shots.push({
      kind,
      user,
      sx,
      sy,
      ox: rand(-0.7, 0.7) * DISC_RX * S,
      oy: rand(-0.3, 0.55) * DISC_RY * S,
      t0: this.time + delay,
      dur: kind === "laser" ? 0.12 : kind === "rocket" ? rand(0.85, 1.15) : kind === "heavy" ? 1.3 : 1.45,
      dmg,
      side: (Math.random() < 0.5 ? -1 : 1) * rand(80, 260),
      color: kind === "laser" ? `hsl(${hue},100%,66%)` : pick(FIREWORK),
      trail: [],
      done: false,
    });
    if (kind === "laser") this.sfx.laser();
    else this.sfx.launch();
  }

  private damage(user: LiveUser, dmg: number, x: number, y: number, big: boolean) {
    if (this.phase !== "battle" || this.hp <= 0) return;
    const d = Math.min(this.hp, dmg);
    this.hp -= d;
    const rec = this.roundDmg.get(user.id) ?? { user, dmg: 0 };
    rec.user = user;
    rec.dmg += d;
    this.roundDmg.set(user.id, rec);
    this.lastHitter = user;
    this.hitFlash = Math.min(1, this.hitFlash + (big ? 0.6 : 0.1));
    this.shake = Math.max(this.shake, big ? 14 : 3);
    if (dmg >= 1) this.floatText(`−${fmt(dmg)}`, x + rand(-20, 20), y - 20, big ? "#ffd55a" : "#ffffff", big ? 46 : 26);
    if (this.hp <= 0) {
      this.hp = 0;
      this.killer = user;
      this.endRound(true);
    }
  }

  // ================= cập nhật =================

  update(dtReal: number) {
    const dt = dtReal * this.timeScale;
    this.time += dt;
    this.phaseT += dt;
    this.hitFlash = approach(this.hitFlash, 0, 6, dtReal);
    this.shake = approach(this.shake, 0, 5, dtReal);
    this.shield = approach(this.shield, 0, 2.5, dtReal);
    this.flash = approach(this.flash, 0, 3, dtReal);
    this.kick = approach(this.kick, 0, 2.2, dt);

    switch (this.phase) {
      case "intro":
        this.updateIntro(dt);
        break;
      case "battle":
        this.updateBattle(dt);
        break;
      case "win":
        this.updateWin(dt);
        break;
      case "lose":
        this.updateLose(dt);
        break;
      case "break":
        if (this.at("free", 0)) {
          // được thả về: bong bóng bật ra lại
          for (const p of this.people) {
            if (p.suck < 0) continue;
            p.suck = -1;
            p.born = this.time + Math.random() * 0.8;
          }
        }
        this.ufoAlive = false;
        if (this.phaseT >= BREAK_T) this.startRound();
        break;
    }

    this.hpShown = approach(this.hpShown, this.hp, this.phase === "intro" ? 2.2 : 14, dtReal);
    this.hpTrail = this.hpTrail < this.hpShown ? this.hpShown : approach(this.hpTrail, this.hpShown, 2.4, dtReal);
    this.beam = approach(this.beam, this.beamWant, 6, dt);

    this.updateShots(dt);
    this.updateFx(dt);
    for (const p of this.people) p.pulse = Math.max(0, p.pulse - dt * 2.5);
  }

  private moveUfo(tx: number, ty: number, rate: number, dt: number) {
    const vx = (tx - this.ux) / Math.max(dt, 1e-3);
    this.ux = approach(this.ux, tx, rate, dt);
    this.uy = approach(this.uy, ty, rate, dt);
    this.tilt = approach(this.tilt, clamp(-vx / 5000, -0.2, 0.2), 4, dt);
  }

  private updateIntro(dt: number) {
    const k = easeInOutCubic(clamp(this.phaseT / 2.4, 0, 1));
    const tx = CX + 180 * Math.sin(this.time * 0.6);
    this.ux = W + 420 + (tx - W - 420) * k;
    this.uy = -300 + (UFO_START_Y + 300) * k - Math.sin(k * Math.PI) * 120;
    this.tilt = (1 - k) * -0.25;
    if (this.at("siren2", 1.4)) this.sfx.siren();
    if (this.phaseT >= INTRO_T) this.setPhase("battle");
  }

  private updateBattle(dt: number) {
    this.progress = Math.min(1, this.progress + dt / this.bal.battleTime);
    const sway = 260 * (1 - this.progress * 0.45);
    const tx = CX + sway * Math.sin(this.time * 0.55) + 50 * Math.sin(this.time * 1.7);
    const ty = lerp(UFO_START_Y, UFO_LAND_Y, this.progress) + Math.sin(this.time * 1.3) * 10 - this.kick;
    this.moveUfo(tx, ty, 3, dt);
    // gần đất: tia hút chập chờn doạ người xem
    if (this.progress > 0.55) {
      const f = Math.sin(this.time * 0.9) + Math.sin(this.time * 2.3);
      this.beamWant = f > 1.1 ? 0.35 + (this.progress - 0.55) : 0;
    } else this.beamWant = 0;
    if (this.progress > 0.75 && this.time - this.alarmAt > 1.8) {
      this.alarmAt = this.time;
      this.sfx.siren();
    }
    // UFO hư hại → bốc khói, cháy
    const hpk = this.hp / this.hpMax;
    if (hpk < 0.6 && Math.random() < dt * (hpk < 0.3 ? 30 : 12)) {
      this.smoke.push({ x: this.ux + rand(-150, 150) * S, y: this.uy + rand(-20, 10), vx: rand(-20, 20), vy: rand(-90, -40), life: 0, max: rand(1.2, 2), size: rand(14, 26) });
    }
    for (const c of this.cannons) {
      const u = (this.time - c.t0) / c.dur;
      if (u < 0 || u > 1) continue;
      const want = c.dmg * clamp(u * 1.05, 0, 1);
      const d = want - c.dealt;
      if (d > 0) {
        c.dealt = want;
        this.damage(c.user, d, this.ux + rand(-60, 60), this.uy + 30, false);
        if (this.phase !== "battle") break;
      }
      if (Math.random() < 0.6) this.sparks(this.ux + rand(-80, 80), this.uy + 40, 2, 500);
    }
    if (this.phase === "battle" && this.progress >= 1) this.endRound(false);
  }

  private updateWin(dt: number) {
    const t = this.phaseT;
    if (this.ufoAlive) {
      // rung dữ dội, nổ dây chuyền trên thân đĩa
      this.moveUfo(this.ux, this.uy, 1, dt);
      this.shake = Math.max(this.shake, 8);
      if (Math.random() < dt * 14) {
        const x = this.ux + rand(-220, 220) * S;
        const y = this.uy + rand(-40, 40) * S;
        this.blasts.push({ x, y, t: this.time, color: pick(FIREWORK), size: rand(60, 110) });
        this.sparks(x, y, 8, 500);
        this.sfx.hit();
      }
      this.timeScale = t < 0.5 ? 0.3 : approach(this.timeScale, 1, 4, dt);
    } else this.timeScale = 1;
    if (this.at("boom", 1.5)) {
      this.ufoAlive = false;
      this.flash = 1;
      this.shake = 30;
      this.sfx.boom();
      this.blasts.push({ x: this.ux, y: this.uy, t: this.time, color: "#ffffff", size: 420 });
      for (let i = 0; i < 3; i++) this.firework(this.ux + rand(-60, 60), this.uy + rand(-30, 30), FIREWORK[i], 90);
      this.sparks(this.ux, this.uy, 120, 1300);
      for (let i = 0; i < 46; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(200, 900);
        this.debris.push({ x: this.ux + rand(-120, 120) * S, y: this.uy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 300, rot: rand(0, 6), vr: rand(-12, 12), w: rand(8, 34), h: rand(4, 14), life: rand(2, 3.5) });
      }
    }
    if (this.at("cheer", 1.8)) this.sfx.win();
    if (t > 2 && t < WIN_T - 1.5 && this.time > this.nextFirework) {
      this.nextFirework = this.time + rand(0.18, 0.45);
      this.firework(rand(120, 960), rand(560, 1000), pick(FIREWORK));
    }
    if (t >= WIN_T) this.setPhase("break");
  }

  private updateLose(dt: number) {
    const t = this.phaseT;
    if (t < 5.6) {
      this.moveUfo(CX, UFO_LAND_Y - 40 + Math.sin(this.time * 1.4) * 6, 2.5, dt);
      this.beamWant = t > 0.5 ? 1 : 0.4;
    } else {
      // no nê rồi bay đi
      this.beamWant = 0;
      const k = t - 5.6;
      this.ux = approach(this.ux, CX + 120, 1.5, dt);
      this.uy -= dt * (200 + k * k * 900);
      this.tilt = approach(this.tilt, -0.15, 2, dt);
    }
    // nuốt từng người: đĩa loé + lấp lánh ở bụng
    for (const p of this.people) {
      if (p.suck < 0) continue;
      const u = (this.time - p.suck) / 0.95;
      if (u >= 1 && u - dt / 0.95 < 1) this.sparks(this.ux + rand(-30, 30), this.uy + BELLY_Y * S, 3, 140);
    }
    if (t >= LOSE_T) this.setPhase("break");
  }

  private shotTarget(s: Shot): [number, number] {
    return [this.ux + s.ox, this.uy + s.oy];
  }

  private shotPos(s: Shot, u: number): [number, number] {
    const [tx, ty] = this.shotTarget(s);
    const cx = s.sx + (tx - s.sx) * 0.25 + s.side;
    const cy = s.sy + (ty - s.sy) * 0.55;
    const a = 1 - u;
    return [a * a * s.sx + 2 * a * u * cx + u * u * tx, a * a * s.sy + 2 * a * u * cy + u * u * ty];
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      if (s.done || this.time < s.t0) continue;
      const u = clamp((this.time - s.t0) / s.dur, 0, 1);
      if (s.kind !== "laser") {
        const [x, y] = this.shotPos(s, ease(u));
        s.trail.push({ x, y, t: this.time });
      }
      if (u >= 1) {
        s.done = true;
        if (!this.ufoAlive) continue;
        const [x, y] = this.shotTarget(s);
        const big = s.kind === "heavy" || s.kind === "mega";
        if (s.kind === "laser") this.sparks(x, y, 2, 240);
        else {
          this.blasts.push({ x, y, t: this.time, color: s.color, size: big ? 200 : 90 });
          this.sparks(x, y, big ? 30 : 8, big ? 800 : 420);
          if (big) this.firework(x, y, s.color, 40);
          this.sfx.hit(big);
        }
        this.damage(s.user, s.dmg, x, y, big);
      }
    }
    for (const s of this.shots) while (s.trail.length && this.time - s.trail[0].t > 0.8) s.trail.shift();
    this.shots = this.shots.filter((s) => !s.done || s.trail.length || this.time - s.t0 - s.dur < 0.2);
    this.cannons = this.cannons.filter((c) => this.time - c.t0 < c.dur + 0.4);
  }

  private updateFx(dt: number) {
    for (const p of this.parts) {
      p.life += dt;
      p.vx *= 1 - Math.min(1, p.drag * dt);
      p.vy = p.vy * (1 - Math.min(1, p.drag * dt)) + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    for (const s of this.streaks) {
      s.life -= dt;
      s.vx *= 1 - dt * 1.6;
      s.vy = s.vy * (1 - dt * 1.6) + 260 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.streaks = this.streaks.filter((s) => s.life > 0);
    if (this.streaks.length > 1600) this.streaks.splice(0, this.streaks.length - 1600);
    this.blasts = this.blasts.filter((b) => this.time - b.t < 0.9);
    for (const s of this.smoke) {
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.size += dt * 24;
    }
    this.smoke = this.smoke.filter((s) => s.life < s.max);
    for (const d of this.debris) {
      d.life -= dt;
      d.vy += 900 * dt;
      d.vx *= 1 - dt * 0.6;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      if (Math.random() < dt * 8) this.smoke.push({ x: d.x, y: d.y, vx: 0, vy: -20, life: 0, max: 0.8, size: 8 });
    }
    this.debris = this.debris.filter((d) => d.life > 0 && d.y < H + 50);
    this.floaters = this.floaters.filter((f) => this.time - f.t < 1.3);
    // băng rôn: hiện lần lượt, cái ưu tiên cao chen lên đầu hàng
    const cur = this.banners[0];
    if (cur && cur.t >= 0 && this.time - cur.t > cur.dur) this.banners.shift();
    const next = this.banners[0];
    if (next && next.t < 0) next.t = this.time;
  }

  private sparks(x: number, y: number, n: number, spread: number) {
    if (this.parts.length > 700) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = spread * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.35 + Math.random() * 0.6, size: n > 1 ? 10 + Math.random() * 20 : 8 + Math.random() * 10, sprite: i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 0, drag: 2.6, gravity: 60 });
    }
  }

  private firework(x: number, y: number, color: string, n = 46) {
    this.blasts.push({ x, y, t: this.time, color, size: 170 });
    const second = FIREWORK[(FIREWORK.indexOf(color) + 3) % FIREWORK.length];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const v = 260 + Math.random() * 380;
      this.streaks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.8 + Math.random() * 0.6, color: i % 3 ? color : second });
    }
    this.sparks(x, y, 10, 500);
  }

  private floatText(text: string, x: number, y: number, color: string, size: number) {
    if (this.floaters.length > 40) this.floaters.shift();
    this.floaters.push({ text, x, y, t: this.time, color, size });
  }

  private toast(title: string, sub: string, color: string, user?: LiveUser, prio = 0) {
    const b: Banner = { title, sub, user, color, prio, dur: prio >= 2 ? 2.6 : 1.8, t: -1 };
    // giữ hàng đợi ngắn: bỏ bớt băng rôn ưu tiên thấp đang chờ
    const waiting = this.banners.slice(1);
    if (waiting.length >= 4) {
      const low = waiting.reduce((m, x) => (x.prio < m.prio ? x : m), waiting[0]);
      if (low.prio <= prio) this.banners.splice(this.banners.indexOf(low), 1);
      else return;
    }
    let i = this.banners.length;
    while (i > 1 && this.banners[i - 1].prio < prio) i--;
    this.banners.splice(i, 0, b);
  }

  // ================= vẽ =================

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    if (this.shake > 0.3) ctx.translate(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);
    ctx.drawImage(this.bg, 0, 0);
    this.drawTowerLights(ctx);

    const back = this.people.filter((p) => p.z < 0.85);
    const front = this.people.filter((p) => p.z >= 0.85);
    for (const p of back) this.drawPerson(ctx, p);
    this.drawBeam(ctx);
    for (const p of front) this.drawPerson(ctx, p);
    this.drawShield(ctx);
    this.drawSmoke(ctx);
    this.drawShots(ctx, false);
    if (this.ufoAlive) this.drawSaucer(ctx);
    this.drawCannons(ctx);
    this.drawShots(ctx, true);
    this.drawFx(ctx);
    ctx.restore();

    this.drawAlarm(ctx);
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,250,235,${this.flash * 0.85})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.drawHud(ctx);
    this.drawFloaters(ctx);
    this.drawPhaseOverlay(ctx);
    this.drawBanner(ctx);
  }

  private drawTowerLights(ctx: CanvasRenderingContext2D) {
    // đèn đỏ đỉnh nhà nhấp nháy
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const on = Math.sin(this.time * 3) > 0;
    this.towers.forEach((t, i) => {
      if (i % 3 || !on) return;
      ctx.globalAlpha = 0.8;
      ctx.drawImage(this.glows[1], t.x + t.w / 2 - 10, t.top - 50, 20, 20);
    });
    ctx.restore();
  }

  private drawPerson(ctx: CanvasRenderingContext2D, p: Person) {
    let [x, y] = this.personPos(p);
    let r = BUBBLE_R * p.z;
    let rot = 0;
    let glow = p.pulse * 0.7;
    if (p.suck >= 0) {
      const su = clamp((this.time - p.suck) / 0.95, 0, 1);
      if (su >= 1) return;
      const e = su * su * (3 - 2 * su);
      const mx = this.ux;
      const my = this.uy + BELLY_Y * S;
      const ang = p.p + su * Math.PI * 3;
      const sw = (1 - e) * 60;
      x = x + (mx - x) * e + Math.cos(ang) * sw;
      y = y + (my - y) * e + Math.sin(ang) * sw * 0.5;
      r *= 1 - 0.85 * e;
      rot = su * 5;
      glow = 0.3 + 0.5 * su;
    } else if (this.beam > 0.05 && this.ufoAlive) {
      // nằm trong tia hút → bị nhấc lên lơ lửng
      const half = this.beamHalf(y);
      if (half > 0 && Math.abs(x - this.ux) < half) {
        const k = 1 - Math.abs(x - this.ux) / half;
        y -= 40 * k * this.beam;
        rot = Math.sin(this.time * 5 + p.p) * 0.3 * k * this.beam;
        glow = Math.max(glow, k * this.beam * 0.6);
      }
    }
    // xuất hiện: phồng lên từ 0, nảy nhẹ
    const age = this.time - p.born;
    if (age < 0) return;
    if (age < 0.6) r *= age < 0.2 ? age / 0.2 : 1 + 0.12 * Math.sin((age - 0.2) * 18) * Math.exp(-(age - 0.2) * 7);
    if (x < -r * 2 || x > W + r * 2) return;

    if (glow > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = glow;
      ctx.drawImage(this.glows[p.suck >= 0 ? 4 : 2], x - r * 2, y - r * 2, r * 4, r * 4);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(this.avatars.get(p.user), -r * 0.92, -r * 0.92, r * 1.84, r * 1.84);
    const sh = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.3, 0, 0, r);
    sh.addColorStop(0, "rgba(0,0,0,0)");
    sh.addColorStop(1, "rgba(0,5,15,0.4)");
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(this.bubbleFx[(p.user.id.length + p.user.id.charCodeAt(0)) % this.bubbleFx.length], -r, -r, r * 2, r * 2);
    ctx.restore();
    if (p.suck < 0) {
      text(ctx, short(p.user.name, 12), x, y + r + 16, 17, "rgba(255,255,255,0.92)", "center", 700);
      const sayAge = this.time - p.sayT;
      if (p.say && sayAge < 2.6) {
        ctx.globalAlpha = clamp(Math.min(sayAge * 6, (2.6 - sayAge) * 3), 0, 1);
        ctx.font = "700 20px system-ui, sans-serif";
        const w = ctx.measureText(p.say).width + 24;
        const bx = clamp(x, w / 2 + 10, W - w / 2 - 10);
        const by = y - r - 34;
        ctx.fillStyle = "rgba(255,255,255,0.94)";
        ctx.beginPath();
        ctx.roundRect(bx - w / 2, by - 18, w, 36, 18);
        ctx.moveTo(x - 8, by + 17);
        ctx.lineTo(x, by + 28);
        ctx.lineTo(x + 8, by + 17);
        ctx.fill();
        ctx.fillStyle = "#14182b";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.say, bx, by + 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  private beamHalf(y: number) {
    const top = this.uy + BELLY_Y * S;
    if (y < top) return 0;
    return 46 + (y - top) * 0.36;
  }

  /** Tia hút xanh lá của kẻ xâm lược (port từ tia hút Option 5) */
  private drawBeam(ctx: CanvasRenderingContext2D) {
    const k = this.beam;
    if (k < 0.02 || !this.ufoAlive) return;
    const top = this.uy + BELLY_Y * S;
    const bottom = PEOPLE_Y1 + 90;
    if (bottom <= top) return;
    const hb = this.beamHalf(bottom);
    const [r, g, b] = [130, 255, 170];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const flick = 0.85 + 0.15 * Math.sin(this.time * 31);
    for (const [w, a] of [[1.25, 0.07], [1, 0.1], [0.7, 0.12], [0.38, 0.16]] as const) {
      const cone = ctx.createLinearGradient(0, top, 0, bottom);
      cone.addColorStop(0, `rgba(${r},${g},${b},${a * 2.2 * k * flick})`);
      cone.addColorStop(0.5, `rgba(${r},${g},${b},${a * k * flick})`);
      cone.addColorStop(1, `rgba(${r},${g},${b},${a * 0.35 * k})`);
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(this.ux - 46 * w, top);
      ctx.lineTo(this.ux + 46 * w, top);
      ctx.lineTo(this.ux + hb * w, bottom);
      ctx.lineTo(this.ux - hb * w, bottom);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 * k})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const f = 1 - ((this.time * 0.9 + i / 5) % 1);
      const y = top + (bottom - top) * f;
      const w = this.beamHalf(y);
      ctx.globalAlpha = Math.sin(f * Math.PI);
      ctx.beginPath();
      ctx.ellipse(this.ux, y, w, w * 0.1, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.7 * k;
    ctx.drawImage(this.glows[4], this.ux - hb * 1.3, bottom - 50, hb * 2.6, 110);
    ctx.restore();
  }

  /** Lá chắn năng lượng phủ thành phố khi có người follow / chia sẻ */
  private drawShield(ctx: CanvasRenderingContext2D) {
    if (this.shield < 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const k = this.shield;
    const ry = 520 + (1 - k) * 60;
    const g = ctx.createRadialGradient(CX, GROUND_Y + 200, ry * 0.7, CX, GROUND_Y + 200, ry * 1.6);
    g.addColorStop(0, "rgba(90,209,255,0)");
    g.addColorStop(0.55, `rgba(90,209,255,${0.35 * k})`);
    g.addColorStop(1, "rgba(90,209,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(CX, GROUND_Y + 200, W * 0.85, ry, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = `rgba(160,235,255,${0.8 * k})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(CX, GROUND_Y + 200, W * 0.8, ry * 0.98, 0, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
  }

  private drawSaucer(ctx: CanvasRenderingContext2D) {
    const danger = this.phase === "battle" && this.progress > 0.75;
    const hot = Math.max(this.beam, 0.4 + this.progress * 0.6);
    ctx.save();
    ctx.translate(this.ux, this.uy);
    ctx.rotate(this.tilt);
    ctx.scale(S, S);
    // quầng sáng trùm vàng
    if (this.boss) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.time * 4);
      ctx.drawImage(this.glows[0], -SCX * 0.9, -SCY * 0.9, SCX * 1.8, SCY * 1.4);
      ctx.restore();
    }
    const body = this.boss ? this.goldSaucer : this.saucer;
    ctx.drawImage(body, -SCX, -SCY);
    ctx.globalCompositeOperation = "lighter";
    if (this.hitFlash > 0.02) {
      ctx.globalAlpha = this.hitFlash * 0.28;
      ctx.drawImage(body, -SCX, -SCY);
    }
    for (const [rx, ry, a] of [[170, 32, 0.5], [122, 23, 0.65], [78, 15, 0.8]] as const) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(${danger ? 255 : 120},${danger ? 70 : 255},${danger ? 70 : 150},${a * (0.35 + 0.65 * hot)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, BELLY_Y - 22 + ry * 0.4, rx, ry, 0, 0.1, Math.PI - 0.1);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.5 + 0.5 * hot;
    ctx.drawImage(this.glows[danger ? 1 : 4], -110, BELLY_Y - 40, 220, 70);
    ctx.globalAlpha = 1;
    // đèn viền chạy: xanh lá / đỏ, nguy hiểm thì đỏ nháy cả loạt
    const n = 20;
    const c = Math.floor(this.time * (6 + 14 * this.progress));
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.04 + (0.92 * i) / (n - 1));
      const x = Math.cos(a) * (DISC_RX - 6);
      const y = Math.sin(a) * (DISC_RY - 4);
      const on = danger ? Math.sin(this.time * 14) > 0 : (i + c) % 4 === 0 || (i + c) % 4 === 2;
      const red = danger || i % 2 === 0;
      ctx.fillStyle = on ? (red ? "rgba(255,120,110,1)" : "rgba(170,255,190,1)") : "rgba(80,60,70,0.6)";
      ctx.beginPath();
      ctx.arc(x, y, on ? 4 : 2.8, 0, Math.PI * 2);
      ctx.fill();
      if (on) {
        ctx.globalAlpha = 0.7;
        ctx.drawImage(this.glows[red ? 1 : 4], x - 18, y - 18, 36, 36);
        ctx.globalAlpha = 1;
      }
    }
    // hư hại nặng: lửa cháy trên thân
    const hpk = this.hp / this.hpMax;
    if (hpk < 0.3) {
      for (const [fx, fy] of [[-150, -8], [110, 4], [30, -40]] as const) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 20 + fx);
        const s = 50 + 14 * Math.sin(this.time * 13 + fy);
        ctx.drawImage(this.glows[1], fx - s, fy - s, s * 2, s * 2);
      }
    }
    ctx.restore();
  }

  private drawSmoke(ctx: CanvasRenderingContext2D) {
    for (const s of this.smoke) {
      const k = s.life / s.max;
      ctx.fillStyle = `rgba(70,74,84,${0.45 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawShots(ctx: CanvasRenderingContext2D, top: boolean) {
    if (!top) {
      // khói tên lửa
      for (const s of this.shots) {
        for (const p of s.trail) {
          const age = this.time - p.t;
          const k = 1 - age / 0.8;
          ctx.fillStyle = `rgba(200,205,215,${(s.kind === "rocket" ? 0.16 : 0.24) * k})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (s.kind === "rocket" ? 3 : 6) + age * (s.kind === "rocket" ? 18 : 34), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // laser
    for (const s of this.shots) {
      if (s.kind !== "laser" || this.time < s.t0) continue;
      const age = this.time - s.t0;
      const u = clamp(age / s.dur, 0, 1);
      const fade = clamp(1 - (age - s.dur) / 0.2, 0, 1);
      if (fade <= 0 || !this.ufoAlive) continue;
      const [tx, ty] = this.shotTarget(s);
      const hx = lerp(s.sx, tx, u);
      const hy = lerp(s.sy, ty, u);
      const tail = clamp(u - 0.35, 0, 1);
      const bx = lerp(s.sx, tx, tail);
      const by = lerp(s.sy, ty, tail);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.drawImage(this.glows[2], hx - 20, hy - 20, 40, 40);
    }
    ctx.globalAlpha = 1;
    // lửa đuôi tên lửa
    for (const s of this.shots) {
      if (s.kind === "laser" || s.done || this.time < s.t0) continue;
      const { x, y, ang, sc } = this.rocketPose(s);
      const fl = 26 + Math.random() * 12;
      ctx.globalAlpha = 0.9;
      const gs = 40 * sc / 1.3;
      ctx.drawImage(this.glows[0], x - Math.cos(ang) * 20 * sc - gs, y - Math.sin(ang) * 20 * sc - gs, gs * 2, gs * 2);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.scale(sc, sc);
      const fg = ctx.createLinearGradient(-14 - fl, 0, -14, 0);
      fg.addColorStop(0, "rgba(255,90,30,0)");
      fg.addColorStop(0.6, "rgba(255,170,60,.9)");
      fg.addColorStop(1, "rgba(255,255,220,1)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-14, -5);
      ctx.quadraticCurveTo(-14 - fl, 0, -14, 5);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // thân tên lửa (+ người tặng ngồi trong ô cửa với tên lửa hạng nặng)
    for (const s of this.shots) {
      if (s.kind === "laser" || s.done || this.time < s.t0) continue;
      const { x, y, ang, sc } = this.rocketPose(s);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.scale(sc, sc);
      const body = ctx.createLinearGradient(0, -7, 0, 7);
      body.addColorStop(0, "#ffffff");
      body.addColorStop(0.5, "#d9dde4");
      body.addColorStop(1, "#8c929c");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.roundRect(-14, -6, 26, 12, 4);
      ctx.fill();
      ctx.fillStyle = s.color === "#ffffff" ? "#ff4757" : s.color;
      ctx.beginPath();
      ctx.moveTo(12, -6);
      ctx.quadraticCurveTo(26, 0, 12, 6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-14, -6);
      ctx.lineTo(-20, -12);
      ctx.lineTo(-8, -6);
      ctx.moveTo(-14, 6);
      ctx.lineTo(-20, 12);
      ctx.lineTo(-8, 6);
      ctx.fill();
      if (s.kind !== "rocket") {
        ctx.rotate(-ang);
        ctx.drawImage(this.avatars.get(s.user), -7, -7, 14, 14);
        ctx.strokeStyle = "#ffd55a";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      if (s.kind !== "rocket") text(ctx, short(s.user.name, 14), x, y + 22 * sc, 22, "#ffd55a", "center", 800);
    }
  }

  private rocketPose(s: Shot) {
    const u = clamp((this.time - s.t0) / s.dur, 0, 1);
    const uu = ease(u);
    const [x, y] = this.shotPos(s, uu);
    const [qx, qy] = this.shotPos(s, Math.min(1, uu + 0.02));
    return { x, y, ang: Math.atan2(qy - y, qx - x), sc: s.kind === "rocket" ? 1.3 : s.kind === "heavy" ? 2.2 : 2.9 };
  }

  /** PHÁO TRÁI ĐẤT: cột năng lượng khổng lồ từ mặt đất bắn thẳng vào UFO */
  private drawCannons(ctx: CanvasRenderingContext2D) {
    if (!this.ufoAlive) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const c of this.cannons) {
      const u = (this.time - c.t0) / c.dur;
      if (u < 0 || u > 1.15) continue;
      const k = u < 0.08 ? u / 0.08 : u > 1 ? 1 - (u - 1) / 0.15 : 1;
      const x0 = c.x;
      const y0 = GROUND_Y + 60;
      const x1 = this.ux;
      const y1 = this.uy + 20;
      for (const [w, col] of [[120, "rgba(255,90,110,0.25)"], [70, "rgba(255,160,120,0.45)"], [30, "rgba(255,240,220,0.9)"]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w * k * (0.9 + 0.1 * Math.sin(this.time * 40));
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.globalAlpha = k;
      ctx.drawImage(this.glows[1], x1 - 160, y1 - 160, 320, 320);
      ctx.drawImage(this.glows[0], x0 - 120, y0 - 120, 240, 240);
      ctx.globalAlpha = 1;
      text(ctx, short(c.user.name, 16), x0, y0 - 150, 30, "#fff", "center", 900);
    }
    ctx.restore();
  }

  private drawFx(ctx: CanvasRenderingContext2D) {
    // mảnh vỡ
    for (const d of this.debris) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = this.boss ? "#b8913c" : "#59606c";
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.fillStyle = "rgba(255,150,80,0.8)";
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w * 0.3, d.h);
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.blasts) {
      const t = (this.time - b.t) / 0.9;
      const fl = clamp(1 - t * 3, 0, 1);
      if (fl > 0) {
        const rg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.size);
        rg.addColorStop(0, `rgba(255,255,240,${fl})`);
        rg.addColorStop(0.4, `rgba(255,220,150,${0.5 * fl})`);
        rg.addColorStop(1, "rgba(255,200,120,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(b.x - b.size, b.y - b.size, b.size * 2, b.size * 2);
      }
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size * 0.18 + t * b.size * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const s of this.streaks) {
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = clamp(s.life / 1.2, 0, 1);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
      ctx.stroke();
    }
    for (const p of this.parts) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, k * 1.2 + 0.05));
      const s = p.size * (p.sprite === 3 ? 0.5 + 0.5 * Math.sin(k * Math.PI) : 1 - k * 0.5);
      ctx.drawImage(this.glows[p.sprite], p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.restore();
  }

  private drawAlarm(ctx: CanvasRenderingContext2D) {
    const danger = (this.phase === "battle" && this.progress > 0.75) || (this.phase === "lose" && this.phaseT < 5.6);
    if (!danger) return;
    const k = this.phase === "lose" ? 0.8 : (this.progress - 0.75) / 0.25;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 7);
    const g = ctx.createRadialGradient(CX, H / 2, H * 0.3, CX, H / 2, H * 0.75);
    g.addColorStop(0, "rgba(255,0,30,0)");
    g.addColorStop(1, `rgba(255,0,30,${(0.25 + 0.35 * k) * pulse})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (this.phase === "battle") {
      const secs = Math.ceil((1 - this.progress) * this.bal.battleTime);
      ctx.globalAlpha = 0.65 + 0.35 * pulse;
      text(ctx, "⚠ UFO SẮP CHẠM ĐẤT ⚠", CX, 750, 52, "#ff4b5c", "center", 900);
      text(ctx, `THẢ TIM NGAY! CÒN ${secs} GIÂY`, CX, 808, 34, "#ffffff", "center", 800);
      ctx.globalAlpha = 1;
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const showBar = this.phase !== "break" && (this.phase !== "lose" || this.phaseT < 5.6);
    // tiêu đề + tỉ số
    text(ctx, this.boss && this.phase !== "break" ? "★ TRÙM: UFO VÀNG ★" : "BẢO VỆ TRÁI ĐẤT", CX, SAFE.top + 22, 34, this.boss ? "#ffd55a" : "#9dff7a", "center", 900);
    if (showBar) {
      const x = 90;
      const y = SAFE.top + 50;
      const w = W - 180;
      const h = 40;
      ctx.fillStyle = "rgba(10,12,24,0.75)";
      ctx.beginPath();
      ctx.roundRect(x - 4, y - 4, w + 8, h + 8, 24);
      ctx.fill();
      const kt = clamp(this.hpTrail / this.hpMax, 0, 1);
      const k = clamp(this.hpShown / this.hpMax, 0, 1);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(h, w * kt), h, 20);
      if (kt > 0) ctx.fill();
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      if (this.boss) {
        g.addColorStop(0, "#ff9a3d");
        g.addColorStop(1, "#ffe27a");
      } else {
        g.addColorStop(0, "#ff2e55");
        g.addColorStop(1, "#ff8a3d");
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(h, w * k), h, 20);
      if (k > 0) ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 20);
      ctx.stroke();
      text(ctx, `👽 UFO  ${fmt(Math.ceil(this.hpShown))} / ${fmt(this.hpMax)}`, CX, y + h / 2 + 1, 24, "#fff", "center", 900);
    }
    text(ctx, `VÒNG ${Math.max(1, this.round)}   ·   🌍 TRÁI ĐẤT ${this.earthWins} : ${this.ufoWins} UFO 👽`, CX, SAFE.top + 128, 26, "rgba(255,255,255,0.9)", "center", 800);

    if (this.phase === "battle") {
      // gợi ý luân phiên
      const tip = TIPS[Math.floor(this.time / 3.5) % TIPS.length];
      if (this.progress <= 0.75) text(ctx, tip, CX, SAFE.top + 175, 28, "#ffe08a", "center", 800);
      this.drawAltimeter(ctx);
      this.drawTopShooters(ctx);
    }
    if (this.status) text(ctx, `● ${this.status}`, 24, H - 24, 18, "#ff8a8a", "left", 700);
    else if (this.demo) text(ctx, "DEMO", 24, H - 24, 18, "rgba(255,255,255,0.4)", "left", 700);
  }

  /** Thước đo độ cao bên trái: UFO tụt dần về vạch đỏ mặt đất */
  private drawAltimeter(ctx: CanvasRenderingContext2D) {
    const x = 34;
    const y0 = 420;
    const y1 = 1000;
    ctx.fillStyle = "rgba(10,12,24,0.7)";
    ctx.beginPath();
    ctx.roundRect(x, y0, 18, y1 - y0, 9);
    ctx.fill();
    const danger = y0 + (y1 - y0) * 0.75;
    ctx.fillStyle = "rgba(255,60,80,0.75)";
    ctx.beginPath();
    ctx.roundRect(x, danger, 18, y1 - danger, 9);
    ctx.fill();
    const my = y0 + (y1 - y0) * this.progress;
    ctx.fillStyle = this.progress > 0.75 ? "#ff4b5c" : "#9dff7a";
    ctx.beginPath();
    ctx.moveTo(x + 22, my);
    ctx.lineTo(x + 40, my - 12);
    ctx.lineTo(x + 40, my + 12);
    ctx.fill();
    const km = Math.round((1 - this.progress) * 100);
    text(ctx, "ĐỘ CAO", x + 9, y0 - 40, 18, "rgba(255,255,255,0.75)", "center", 800);
    text(ctx, `${km}km`, x + 9, y0 - 16, 24, "#fff", "center", 900);
    text(ctx, "🌍", x + 9, y1 + 26, 26, "#fff", "center", 400);
  }

  private topShooters(n: number) {
    return [...this.roundDmg.values()].sort((a, b) => b.dmg - a.dmg).slice(0, n);
  }

  private drawTopShooters(ctx: CanvasRenderingContext2D) {
    const top = this.topShooters(3);
    if (!top.length) return;
    const x = W - 300;
    const y = 560;
    ctx.fillStyle = "rgba(10,12,24,0.6)";
    ctx.beginPath();
    ctx.roundRect(x - 14, y - 40, 300, 40 + top.length * 56, 16);
    ctx.fill();
    text(ctx, "TOP XẠ THỦ", x, y - 18, 20, "#ffd55a", "left", 900);
    top.forEach((r, i) => {
      const yy = y + 8 + i * 56;
      ctx.drawImage(this.avatars.get(r.user), x, yy, 42, 42);
      text(ctx, `${i + 1}. ${short(r.user.name, 11)}`, x + 52, yy + 13, 19, "#fff", "left", 800);
      text(ctx, `${fmt(Math.round(r.dmg))} sát thương`, x + 52, yy + 34, 16, "rgba(255,255,255,0.7)", "left", 600);
    });
  }

  private drawFloaters(ctx: CanvasRenderingContext2D) {
    for (const f of this.floaters) {
      const age = this.time - f.t;
      const k = age / 1.3;
      ctx.globalAlpha = clamp(1 - k * k, 0, 1);
      const s = f.size * (age < 0.12 ? 0.6 + (age / 0.12) * 0.4 : 1);
      ctx.font = `900 ${s}px system-ui, sans-serif`;
      const half = ctx.measureText(f.text).width / 2 + 12;
      text(ctx, f.text, clamp(f.x, half, W - half), f.y - age * 70, s, f.color, "center", 900);
    }
    ctx.globalAlpha = 1;
  }

  private drawPhaseOverlay(ctx: CanvasRenderingContext2D) {
    const t = this.phaseT;
    if (this.phase === "intro") {
      const blink = Math.sin(this.time * 9) > -0.2;
      const k = clamp(t / 0.3, 0, 1) * clamp((INTRO_T - t) / 0.4, 0, 1);
      ctx.globalAlpha = k;
      // dải cảnh báo
      ctx.fillStyle = "rgba(200,0,30,0.75)";
      ctx.fillRect(0, 720, W, 170);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 720, W, 170);
      ctx.clip();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let i = -2; i < 16; i++) {
        const x0 = i * 90 + ((this.time * 160) % 90);
        ctx.beginPath();
        ctx.moveTo(x0, 720);
        ctx.lineTo(x0 + 45, 720);
        ctx.lineTo(x0 + 5, 890);
        ctx.lineTo(x0 - 40, 890);
        ctx.fill();
      }
      ctx.restore();
      if (blink) text(ctx, this.boss ? "⚠ TRÙM UFO VÀNG ⚠" : "⚠ CẢNH BÁO ⚠", CX, 775, 58, "#fff", "center", 900);
      text(ctx, "UFO XÂM LƯỢC ĐANG HẠ CÁNH!", CX, 845, 42, "#ffe08a", "center", 900);
      ctx.globalAlpha = 1;
    } else if (this.phase === "win" && t > 1.7) {
      const k = easeOutBack(clamp((t - 1.7) / 0.5, 0, 1));
      const fade = clamp((WIN_T - t) / 0.6, 0, 1);
      ctx.globalAlpha = fade;
      ctx.save();
      ctx.translate(CX, 640);
      ctx.scale(k, k);
      text(ctx, "TRÁI ĐẤT AN TOÀN!", 0, 0, 78, "#9dff7a", "center", 900);
      ctx.restore();
      if (t > 2.4) this.drawMvp(ctx, clamp((t - 2.4) / 0.4, 0, 1) * fade);
      ctx.globalAlpha = 1;
    } else if (this.phase === "lose" && t > 1.2) {
      const k = easeOutBack(clamp((t - 1.2) / 0.5, 0, 1));
      const fade = clamp((LOSE_T - t) / 0.6, 0, 1);
      ctx.globalAlpha = fade;
      ctx.save();
      ctx.translate(CX, 620);
      ctx.scale(k, k);
      text(ctx, "CẢ LIVE ĐÃ BỊ", 0, -50, 64, "#ffffff", "center", 900);
      text(ctx, "BẮT CÓC! 👽", 0, 30, 92, "#9dff7a", "center", 900);
      ctx.restore();
      if (t > 2) {
        ctx.globalAlpha = fade * clamp((t - 2) / 0.4, 0, 1);
        text(ctx, `${this.abducted} người dân đã bị đưa lên phi thuyền`, CX, 730, 32, "#ffe08a", "center", 800);
        text(ctx, "Thả tim để phục thù ở vòng sau!", CX, 780, 30, "#fff", "center", 700);
      }
      ctx.globalAlpha = 1;
    } else if (this.phase === "break") {
      const k = clamp(t / 0.4, 0, 1) * clamp((BREAK_T - t) / 0.3, 0, 1);
      ctx.globalAlpha = k;
      ctx.fillStyle = "rgba(5,8,20,0.55)";
      ctx.beginPath();
      ctx.roundRect(110, 560, W - 220, 360, 32);
      ctx.fill();
      text(ctx, this.round === 0 ? "SẴN SÀNG BẢO VỆ TRÁI ĐẤT?" : "MỌI NGƯỜI ĐÃ ĐƯỢC THẢ VỀ", CX, 620, 36, "#9dff7a", "center", 900);
      text(ctx, "VÒNG TIẾP THEO SAU", CX, 690, 30, "#fff", "center", 800);
      text(ctx, `${Math.max(0, Math.ceil(BREAK_T - t))}`, CX, 790, 120, "#ffd55a", "center", 900);
      text(ctx, "❤️ tim · 💬 bình luận · 🎁 quà · ➕ follow", CX, 880, 26, "rgba(255,255,255,0.85)", "center", 700);
      ctx.globalAlpha = 1;
    }
  }

  /** Vinh danh: người ra đòn kết liễu + top 3 xạ thủ */
  private drawMvp(ctx: CanvasRenderingContext2D, a: number) {
    ctx.globalAlpha *= a;
    ctx.fillStyle = "rgba(8,10,24,0.72)";
    ctx.beginPath();
    ctx.roundRect(110, 700, W - 220, 420, 32);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,213,90,0.6)";
    ctx.lineWidth = 3;
    ctx.stroke();
    if (this.killer) {
      ctx.drawImage(this.avatars.get(this.killer), CX - 60, 730, 120, 120);
      ctx.strokeStyle = "#ffd55a";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(CX, 790, 62, 0, Math.PI * 2);
      ctx.stroke();
      text(ctx, "ĐÒN KẾT LIỄU", CX, 880, 24, "#ffd55a", "center", 900);
      text(ctx, short(this.killer.name, 20), CX, 920, 40, "#fff", "center", 900);
    }
    const top = this.topShooters(3);
    top.forEach((r, i) => {
      const x = 170 + i * 250;
      const y = 975;
      ctx.drawImage(this.avatars.get(r.user), x, y, 56, 56);
      text(ctx, `${["🥇", "🥈", "🥉"][i]} ${short(r.user.name, 9)}`, x + 28, y + 80, 20, "#fff", "center", 800);
      text(ctx, fmt(Math.round(r.dmg)), x + 28, y + 106, 18, "#ffd55a", "center", 800);
    });
  }

  private drawBanner(ctx: CanvasRenderingContext2D) {
    const b = this.banners[0];
    if (!b || b.t < 0) return;
    const age = this.time - b.t;
    const inK = easeOutBack(clamp(age / 0.35, 0, 1));
    const out = clamp((b.dur - age) / 0.25, 0, 1);
    const w = 880;
    const h = 104;
    const x = CX - w / 2 + (1 - inK) * -W * 0.6;
    const y = SAFE.top + 220;
    ctx.globalAlpha = out;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "rgba(10,12,28,0.92)");
    g.addColorStop(1, "rgba(30,20,60,0.88)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 52);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 4;
    ctx.stroke();
    let tx = x + 40;
    if (b.user) {
      ctx.drawImage(this.avatars.get(b.user), x + 14, y + 12, 80, 80);
      tx = x + 112;
    }
    text(ctx, short(b.title, 30), tx, y + 38, 32, b.color, "left", 900);
    if (b.sub) text(ctx, short(b.sub, 40), tx, y + 76, 24, "rgba(255,255,255,0.88)", "left", 700);
    ctx.globalAlpha = 1;
  }

  // ---------- thông tin cho trang thử / chẩn đoán ----------
  stats() {
    return {
      phase: this.phase,
      round: this.round,
      hp: Math.round(this.hp),
      hpMax: this.hpMax,
      progress: +this.progress.toFixed(3),
      people: this.people.length,
      shots: this.shots.length,
      particles: this.parts.length + this.streaks.length,
    };
  }
}

// ---------------- tiện ích ----------------

const ease = (u: number) => u * u * (2 - u) * 0.85 + u * 0.15;

function fmt(n: number) {
  return Math.round(n).toLocaleString("vi-VN");
}

function short(s: string, n: number) {
  const a = [...s];
  return a.length > n ? a.slice(0, n - 1).join("") + "…" : s;
}

/** Chữ có viền tối để đọc được trên mọi nền */
function text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center", weight = 800) {
  ctx.font = `${weight} ${size}px system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

