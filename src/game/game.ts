import type { LiveEvent, LiveUser } from "../live/events";
import { Avatars } from "./avatars";
import type { Balance } from "./balance";
import { font } from "./font";
import { BOSSES, isMilestone, milestoneBoss, nextMilestone, PLANET_EYE, RANDOM_BOSSES, makeBossSprite, type BossDef, type BossId } from "./bosses";
import { resolveGift, WEAPON_CAP, WEAPON_LABEL } from "./gifts";
import { approach, clamp, easeInOutCubic, easeOutBack, lerp, pick, rand } from "./math";
import { Sfx } from "./sfx";
import {
  BELLY_Y,
  DISC_RX,
  DISC_RY,
  makeBackground,
  makeBubble,
  makeGlow,
  makeStar,
  SCX,
  SCY,
  type Img,
  type Tower,
} from "./sprites";
import { CX, GROUND_Y, H, PEOPLE_Y0, PEOPLE_Y1, SAFE, UFO_LAND_Y, UFO_START_Y, W } from "./stage";

/**
 * BẢO VỆ TRÁI ĐẤT — game tương tác TikTok Live.
 *
 *  intro  — còi báo động, UFO xâm lược lao vào từ góc trên, thanh máu nạp đầy.
 *  battle — UFO hạ dần xuống thành phố. Người xem bắn hạ nó:
 *             ❤️ tim = laser · 💬 bình luận = tên lửa · 🎁 quà = vũ khí riêng theo từng món (xem gifts.ts)
 *             📦 rương xu = thùng tiếp tế rơi xuống, cả phòng được ĐẠN VÀNG · xu góp vào QUỸ PHÒNG THỦ → ĐẠN VÀNG ×2
 *             ➕ follow / ↗ chia sẻ = đẩy UFO lùi lên.
 *           Mỗi người tương tác có 1 bong bóng mang ảnh đại diện lơ lửng trên mái nhà — đạn bắn ra từ chính bong bóng đó.
 *  win    — hết máu: slow-motion, nổ dây chuyền, nổ lớn, pháo hoa; vinh danh người ra đòn kết liễu + top xạ thủ.
 *  lose   — chạm đất: tia hút xanh bật, cả hội trường bị hút xoắn ốc vào bụng đĩa — "CẢ LIVE ĐÃ BỊ BẮT CÓC".
 *  break  — mọi người được thả về, đếm ngược vòng sau. Độ khó tự cân bằng (thắng → máu UFO tăng, thua → giảm).
 */

export type Phase = "intro" | "battle" | "win" | "lose" | "break";

const INTRO_T = 3.6; // vòng thường; vòng trùm dùng BOSS_INTRO_T
const WIN_T = 10.5;
const LOSE_T = 9;
const BREAK_T = 6.5;
const CRATE_Y = 1110;
const CONFETTI = ["#ffd55a", "#ff5a6e", "#5ad1ff", "#9dff7a", "#ffffff", "#d58bff"];
const MAX_PEOPLE = 30;
const BUBBLE_R = 47;
const BOSS_INTRO_T = 6;
const SAVE_KEY = "ufo-live-score";
const FIREWORK = ["#ffd55a", "#ff5a6e", "#5ad1ff", "#9dff7a", "#ffffff", "#ff9a3d", "#d58bff"];
const TIPS = [
  "❤️ THẢ TIM = BẮN LASER",
  "💬 BÌNH LUẬN = PHÓNG TÊN LỬA",
  "🎁 MỖI MÓN QUÀ = 1 VŨ KHÍ RIÊNG",
  "🪙 GÓP XU ĐẦY QUỸ = ĐẠN VÀNG ×2",
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
  /** combo quà đang chạy: "🌹 ×12" trên đầu bong bóng */
  combo: { icon: string; n: number; t: number } | null;
}

type ShotKind = "laser" | "rocket" | "heavy" | "mega" | "heart" | "bill";
const isRocket = (k: ShotKind) => k === "rocket" || k === "heavy" || k === "mega";
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
  /** hiệu ứng khi trúng: cánh hoa hồng / pháo giấy */
  fx: "" | "rose" | "confetti";
  /** đạn của cả phòng (tim, bình luận) — được ĐẠN VÀNG nhân đôi; đạn quà đã có trần riêng nên không */
  boost: boolean;
  /** ghi tên người tặng dưới tên lửa lớn (phi đội của SIÊU VŨ KHÍ thì không, cho đỡ rối) */
  label: boolean;
  /** nhắm vào UFO con thay vì thân trùm */
  drone: Drone | null;
}

/** Tia năng lượng gây sát thương liên tục: pháo mặt đất / laser đôi kính râm / tia từ quỹ đạo */
interface Beam {
  style: "earth" | "twin" | "orbital";
  user: LiveUser;
  x: number;
  y: number;
  t0: number;
  dur: number;
  dmg: number;
  dealt: number;
}

/** UFO con do Phi Thuyền Mẹ thả xuống: chạm phố là bắt 1 người */
interface Drone {
  x: number;
  y: number;
  x0: number;
  y0: number;
  tx: number;
  t0: number;
  hp: number;
  max: number;
  dead: boolean;
}

/** Rương xu: thùng tiếp tế dù rơi xuống, chạm đất thì mở */
interface Crate {
  user: LiveUser;
  coins: number;
  x: number;
  t0: number;
  openT: number; // -1 = chưa mở
}

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
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
  private sprites = new Map<BossId, Img>();
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
  /** trùm của vòng hiện tại (UFO thường cũng là 1 "trùm" hạng thường) */
  bossDef: BossDef = BOSSES.ufo;
  /** chuỗi thắng liên tiếp & kỷ lục */
  streak = 0;
  bestStreak = 0;
  private lostStreak = 0;
  /** mốc chuỗi thắng đã gọi trùm của vòng này */
  private bossMilestone = 0;
  /** độ mờ bảng TOP XẠ THỦ (mờ đi khi trùm bay ngang qua) */
  private topAlpha = 1;
  private battleTime = 75;
  private introDur = INTRO_T;
  private forcedBoss: BossId | null = null;
  // kỹ năng trùm
  private abilityT = 0;
  private grab: { p: Person; t0: number; need: number; dealt: number } | null = null;
  private stun = new Map<string, number>();
  private bolts: { p: Person; t0: number; x0: number; y0: number }[] = [];
  private shieldHp = 0;
  private shieldMax = 0;
  private drones: Drone[] = [];
  private charge: { t0: number; need: number; dealt: number } | null = null;
  private cloak = 0;
  private eyeBlast = 0;
  private muzzle = 0;
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
  /** ĐẠN VÀNG ×2 tới thời điểm này */
  private goldUntil = 0;
  /** đang bắn vũ khí từ quà (đạn không được ĐẠN VÀNG nhân đôi) */
  private giftCtx = false;
  /** quỹ phòng thủ: xu cả phòng góp trong vòng */
  fund = 0;
  fundGoal = 100;
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
  private beams: Beam[] = [];
  private crates: Crate[] = [];
  private confetti: Confetto[] = [];
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
    this.load();
  }

  get boss() {
    return this.bossDef.kind !== "normal";
  }

  private bossLabel() {
    return this.bossDef.kind === "milestone" ? `TRÙM CHUỖI ${this.bossMilestone}` : "TRÙM NGẪU NHIÊN";
  }

  /** tỉ lệ vẽ model hiện tại */
  private get sc() {
    return this.bossDef.scale;
  }

  /** khoảng cách tâm → bụng (px màn hình) */
  private get belly() {
    return this.bossDef.bellyY * this.sc;
  }

  private sprite(id: BossId) {
    let img = this.sprites.get(id);
    if (!img) {
      img = makeBossSprite(id);
      this.sprites.set(id, img);
    }
    return img;
  }

  private get cloaked() {
    return this.bossDef.ability === "cloak" && this.phase === "battle" && this.phaseT % 11 > 7;
  }

  // ---------- lưu tỉ số (tải lại trang giữa buổi live không mất chuỗi thắng) ----------
  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, number>;
      this.earthWins = d.earthWins | 0;
      this.ufoWins = d.ufoWins | 0;
      this.streak = d.streak | 0;
      this.bestStreak = d.bestStreak | 0;
      this.round = d.round | 0;
      this.diffMul = clamp(+d.diffMul || 1, 0.45, 6);
    } catch {
      /* không có bộ nhớ trình duyệt */
    }
  }

  private save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ earthWins: this.earthWins, ufoWins: this.ufoWins, streak: this.streak, bestStreak: this.bestStreak, round: this.round, diffMul: this.diffMul }));
    } catch {
      /* bỏ qua */
    }
  }

  // ================= điều khiển =================

  /** Bắt đầu lại từ đầu (phím R) */
  restart() {
    this.earthWins = 0;
    this.ufoWins = 0;
    this.round = 0;
    this.diffMul = 1;
    this.streak = 0;
    this.bestStreak = 0;
    this.startRound();
  }

  /** Phím B: chọn trước trùm cho vòng sau, bấm lần nữa đổi sang trùm khác */
  cycleBoss() {
    const ids = Object.keys(BOSSES) as BossId[];
    const cur = this.forcedBoss ? ids.indexOf(this.forcedBoss) : 0;
    this.forcedBoss = ids[(cur + 1) % ids.length];
    const d = BOSSES[this.forcedBoss];
    this.toast(`Vòng sau: ${d.name}`, d.power || "UFO thường", d.color);
    return d.name;
  }

  /** Bắt đầu ngay 1 trận với trùm chỉ định (dùng để thử) */
  debugBoss(id: BossId) {
    this.forcedBoss = id;
    this.startRound();
    this.ux = CX;
    this.uy = UFO_START_Y;
    this.setPhase("battle");
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
    // chọn trùm: trùm mốc chuỗi thắng > trùm ngẫu nhiên > UFO thường
    let id: BossId = "ufo";
    if (this.forcedBoss) id = this.forcedBoss;
    else if (this.streak > 0 && isMilestone(this.streak)) id = milestoneBoss(this.streak);
    else if (this.round > 1 && Math.random() < this.bal.bossChance) id = pick(RANDOM_BOSSES);
    this.forcedBoss = null;
    const def = (this.bossDef = BOSSES[id]);
    this.bossMilestone = def.kind === "milestone" ? (isMilestone(this.streak) ? this.streak : def.milestone ?? 0) : 0;
    this.battleTime = this.bal.battleTime * def.timeMul;
    this.introDur = def.kind === "normal" ? INTRO_T : BOSS_INTRO_T;
    const viewers = this.activeCount();
    this.hpMax = Math.max(50, Math.round((this.bal.hpBase + this.bal.hpPerViewer * viewers) * this.diffMul * def.hpMul));
    this.grab = null;
    this.stun.clear();
    this.bolts = [];
    this.drones = [];
    this.charge = null;
    this.cloak = 0;
    this.eyeBlast = 0;
    this.abilityT = this.time + this.introDur + 7;
    this.shieldMax = def.ability === "shield" ? Math.round(this.hpMax * 0.12) : 0;
    this.shieldHp = this.shieldMax;
    this.hp = this.hpMax;
    this.hpShown = 0;
    this.hpTrail = 0;
    this.progress = 0;
    this.roundDmg.clear();
    this.fund = 0;
    this.fundGoal = this.bal.fundGoal;
    this.goldUntil = 0;
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
    for (const c of this.beams) c.dur = 0;
    this.grab = null;
    this.charge = null;
    for (const d of this.drones) d.dead = true;
    if (win) {
      this.earthWins++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      // thắng trùm không làm vòng thường sau khó vọt lên
      this.diffMul = clamp(this.diffMul * (this.boss ? 1.05 : 1.18), 0.45, 6);
      this.setPhase("win");
      this.timeScale = 0.3;
      this.sfx.hit(true);
    } else {
      this.ufoWins++;
      this.lostStreak = this.streak;
      this.streak = 0;
      this.diffMul = clamp(this.diffMul * (this.boss ? 0.92 : 0.8), 0.45, 6);
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
    this.save();
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
      case "gift":
        this.onGift(user, person, e.gift, e.coins, e.count, fighting);
        break;
      case "envelope":
        this.dropCrate(user, e.coins);
        break;
      case "follow":
        this.pushBack(user, this.bal.followPush, "dựng lá chắn");
        break;
      case "share":
        this.pushBack(user, this.bal.sharePush, "gọi viện binh");
        break;
    }
  }

  /** ĐẠN VÀNG đang bật: mọi sát thương ×2 */
  get golden() {
    return this.time < this.goldUntil;
  }

  /** Mỗi món quà có vũ khí riêng; sát thương theo tổng xu, có trần theo loại vũ khí */
  private onGift(user: LiveUser, person: Person, giftName: string, coins: number, count: number, fighting: boolean) {
    const g = resolveGift(giftName, coins);
    const n = Math.max(1, Math.round(count));
    const total = Math.max(1, coins) * n;
    const c = person.combo;
    if (c && c.icon === g.icon && this.time - c.t < 4) {
      c.n += n;
      c.t = this.time;
    } else person.combo = { icon: g.icon, n, t: this.time };
    const label = n > 1 ? `${g.icon} ${g.name} ×${n}` : `${g.icon} ${g.name}`;

    if (!fighting) {
      // ngoài trận: quà thành pháo hoa ăn mừng
      const k = g.weapon === "orbital" ? 12 : g.weapon === "cannon" ? 8 : total >= 100 ? 4 : total >= 10 ? 2 : 1;
      for (let i = 0; i < k; i++) this.firework(rand(160, 920), rand(520, 950), pick(FIREWORK));
      if (total >= 10) this.toast(`Cảm ơn ${user.name}!`, `${label} · ${fmt(total)} xu`, "#ffd55a", user, 1);
      return;
    }

    const dmg = Math.min(total * this.bal.giftDmg, Math.max(this.bal.giftDmg, this.hpMax * WEAPON_CAP[g.weapon]));
    const [px, py] = this.originFor(user);
    this.giftCtx = true;
    switch (g.weapon) {
      case "rocket":
      case "rose": {
        const k = Math.min(8, n);
        for (let i = 0; i < k; i++) this.fire("rocket", user, dmg / k, i * 0.09, g.weapon === "rose" ? "rose" : "");
        break;
      }
      case "heart": {
        const k = Math.min(15, n * 3);
        for (let i = 0; i < k; i++) this.fire("heart", user, dmg / k, i * 0.06);
        break;
      }
      case "heavy":
        this.fire("heavy", user, dmg);
        break;
      case "confetti":
        this.fire("heavy", user, dmg, 0, "confetti");
        break;
      case "mega":
        for (let i = 0; i < 3; i++) this.fire("mega", user, dmg / 3, i * 0.18);
        this.shake = Math.max(this.shake, 10);
        break;
      case "moneyGun": {
        const k = 26;
        for (let i = 0; i < k; i++) this.fire("bill", user, dmg / k, i * 0.06);
        break;
      }
      case "twinLaser":
        this.beams.push({ style: "twin", user, x: px, y: py, t0: this.time, dur: 1.8, dmg, dealt: 0 });
        this.sfx.launch();
        break;
      case "cannon":
        this.beams.push({ style: "earth", user, x: px, y: GROUND_Y + 60, t0: this.time, dur: 2.6, dmg, dealt: 0 });
        this.shake = Math.max(this.shake, 18);
        this.sfx.launch();
        break;
      case "orbital": {
        // tia từ quỹ đạo gánh 70%, phi đội tên lửa từ khắp thành phố gánh 30%
        this.beams.push({ style: "orbital", user, x: this.ux, y: -60, t0: this.time + 0.4, dur: 3.2, dmg: dmg * 0.7, dealt: 0 });
        const squad = this.people.filter((p) => p.suck < 0).slice(0, 12);
        const k = Math.max(1, squad.length);
        squad.forEach((p, i) => this.fire("heavy", user, (dmg * 0.3) / k, 0.2 + i * 0.12, "", p.user));
        if (!squad.length) this.fire("mega", user, dmg * 0.3, 0.2);
        this.shake = Math.max(this.shake, 26);
        this.flash = 0.6;
        this.sfx.boom();
        break;
      }
    }
    this.giftCtx = false;
    // quà nhỏ: combo "🌹 ×12" trên bong bóng là đủ; quà từ 10 xu có băng rôn
    if (total >= 10) {
      const prio = g.weapon === "orbital" ? 4 : g.weapon === "cannon" ? 3 : total >= 100 ? 2 : 1;
      const color = g.weapon === "orbital" ? "#9fd8ff" : g.weapon === "cannon" ? "#ff5a6e" : "#ffd55a";
      this.toast(`${user.name}: ${label}`, `${WEAPON_LABEL[g.weapon]} · ${fmt(total)} xu`, color, user, prio);
    }
    this.addFund(user, total);
  }

  /** Xu góp vào quỹ phòng thủ; đủ mốc → ĐẠN VÀNG ×2 cho cả phòng, mốc sau cao hơn */
  private addFund(user: LiveUser, coins: number) {
    if (this.phase !== "battle") return;
    this.fund += coins;
    let filled = 0;
    while (this.fund >= this.fundGoal) {
      this.fund -= this.fundGoal;
      this.fundGoal = Math.round((this.fundGoal * 1.6) / 10) * 10;
      filled++;
    }
    if (filled) this.activateGold(this.bal.goldTime * filled, `Quỹ đầy nhờ ${user.name} · tim & chat ×2`, user);
  }

  private activateGold(sec: number, sub: string, user?: LiveUser) {
    // cộng dồn nhưng tối đa 30 giây còn lại (quà khủng làm đầy quỹ nhiều lần cũng không kéo dài mãi)
    this.goldUntil = Math.min(this.time + 30, Math.max(this.goldUntil, this.time) + sec);
    for (const p of this.people) p.pulse = 1;
    this.toast("⚡ ĐẠN VÀNG ×2 KÍCH HOẠT!", sub, "#ffd55a", user, 3);
    this.sfx.win();
  }

  /** Rương xu: thùng tiếp tế treo dù rơi xuống thành phố */
  private dropCrate(user: LiveUser, coins: number) {
    if (this.crates.length > 4) return;
    this.crates.push({ user, coins, x: rand(240, 840), t0: this.time, openT: -1 });
    this.toast(`📦 ${user.name} thả Rương xu!`, `${fmt(coins)} xu · đang rơi xuống thành phố`, "#ffd55a", user, 2);
    this.addFund(user, coins);
  }

  private crateY(c: Crate) {
    const u = clamp((this.time - c.t0) / 2.6, 0, 1);
    return lerp(-160, CRATE_Y, 1 - (1 - u) * (1 - u));
  }

  private crateX(c: Crate) {
    return c.x + Math.sin((this.time - c.t0) * 1.8) * 30 * (c.openT < 0 ? 1 : 0);
  }

  private openCrate(c: Crate) {
    c.openT = this.time;
    const x = this.crateX(c);
    this.sparks(x, CRATE_Y, 50, 700);
    for (let i = 0; i < 3; i++) this.firework(x + rand(-80, 80), CRATE_Y - rand(80, 220), "#ffd55a", 36);
    for (let i = 0; i < 60; i++) this.confetti.push({ x, y: CRATE_Y - 20, vx: rand(-420, 420), vy: rand(-900, -300), rot: rand(0, 6), vr: rand(-10, 10), color: "#ffd55a", life: rand(1.6, 2.6) });
    this.sfx.hit(true);
    if (this.phase === "battle" && this.ufoAlive) {
      this.progress = Math.max(0, this.progress - 0.05);
      this.kick += 50;
      this.activateGold(this.bal.goldTime, `Rương của ${c.user.name} · tim & chat ×2`, c.user);
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
      combo: null,
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

  private fire(kind: ShotKind, user: LiveUser, dmg: number, delay = 0, fx: Shot["fx"] = "", from?: LiveUser) {
    // quá nhiều đạn trên màn → cộng sát thương thẳng, không vẽ thêm (giữ FPS lúc mưa tim)
    if (this.shots.length > 140 && kind === "laser") {
      this.damage(user, dmg, this.ux + rand(-120, 120), this.uy, false, !this.giftCtx);
      return;
    }
    const [sx, sy] = this.originFor(from ?? user);
    const hue = this.avatars.hue(user);
    this.shots.push({
      kind,
      user,
      sx,
      sy,
      ox: rand(-0.7, 0.7) * this.bossDef.hitRx * this.sc,
      oy: (this.bossDef.hitCy + rand(-0.5, 0.6) * this.bossDef.hitRy) * this.sc,
      t0: this.time + delay,
      dur: kind === "laser" ? 0.12 : kind === "bill" ? rand(0.55, 0.75) : kind === "heart" ? rand(0.7, 0.9) : kind === "rocket" ? rand(0.85, 1.15) : kind === "heavy" ? 1.3 : 1.45,
      dmg,
      side: (Math.random() < 0.5 ? -1 : 1) * rand(80, 260),
      color: kind === "laser" ? (this.golden ? "#ffd55a" : `hsl(${hue},100%,66%)`) : fx === "rose" || kind === "heart" ? "#ff5a8a" : kind === "bill" ? "#7dff9a" : pick(FIREWORK),
      trail: [],
      done: false,
      fx,
      boost: !this.giftCtx,
      label: !from,
      // Phi Thuyền Mẹ: gần nửa số đạn tự nhắm UFO con đang lao xuống
      drone: this.drones.length && kind !== "mega" && Math.random() < 0.45 ? pick(this.drones.filter((d) => !d.dead)) ?? null : null,
    });
    if (kind === "laser" || kind === "heart" || kind === "bill") this.sfx.laser();
    else this.sfx.launch();
  }

  private damage(user: LiveUser, dmg: number, x: number, y: number, big: boolean, boost = false) {
    if (this.phase !== "battle" || this.hp <= 0) return;
    if (boost && this.golden) dmg *= 2;
    // bị Chiến Hạm Đỏ bắn choáng: sát thương giảm một nửa
    if ((this.stun.get(user.id) ?? 0) > this.time) dmg *= 0.5;
    // Tàu Tàng Hình đang biến mất: phần lớn đạn trượt
    if (this.cloaked) {
      dmg *= 0.3;
      if (Math.random() < 0.15) this.floatText("TRƯỢT", x, y - 30, "#7fd8ff", 24);
    }
    if (this.grab) this.grab.dealt += dmg;
    if (this.charge) this.charge.dealt += dmg;
    // Pháo Đài Tinh Thể: khiên hứng sát thương trước
    if (this.shieldHp > 0) {
      const a = Math.min(this.shieldHp, dmg);
      this.shieldHp -= a;
      dmg -= a;
      if (this.shieldHp <= 0) {
        this.shieldHp = 0;
        this.abilityT = this.time + 12;
        this.toast("💥 PHÁ KHIÊN TINH THỂ!", `${user.name} ra đòn quyết định`, "#7ff0ff", user, 3);
        this.sparks(this.ux, this.uy, 60, 900);
        for (let i = 0; i < 3; i++) this.firework(this.ux + rand(-150, 150), this.uy + rand(-150, 150), "#7ff0ff", 40);
        this.sfx.hit(true);
      }
      if (dmg <= 0) {
        if (big) this.floatText("🛡", x, y - 20, "#7ff0ff", 36);
        return;
      }
    }
    const d = Math.min(this.hp, dmg);
    this.hp -= d;
    const rec = this.roundDmg.get(user.id) ?? { user, dmg: 0 };
    rec.user = user;
    rec.dmg += d;
    this.roundDmg.set(user.id, rec);
    this.lastHitter = user;
    this.hitFlash = Math.min(1, this.hitFlash + (big ? 0.6 : 0.1));
    this.shake = Math.max(this.shake, big ? 14 : 3);
    // số nhỏ (từng phát tim) không hiện để UFO đỡ rối; số to & đòn quà luôn hiện
    if (big || dmg >= 10) this.floatText(`−${fmt(dmg)}`, x + rand(-20, 20), y - 20, big ? "#ffd55a" : "#ffffff", big ? 46 : 26);
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
    if (this.phaseT >= this.introDur) this.setPhase("battle");
  }

  private updateBattle(dt: number) {
    this.progress = Math.min(1, this.progress + dt / this.battleTime);
    this.updateAbility(dt);
    const sway = 260 * (1 - this.progress * 0.45);
    const tx = CX + sway * Math.sin(this.time * 0.55) + 50 * Math.sin(this.time * 1.7);
    const ty = lerp(UFO_START_Y, UFO_LAND_Y, this.progress) + Math.sin(this.time * 1.3) * 10 - this.kick;
    // trùm to (Phi Thuyền Mẹ…) lượn hẹp lại để không tràn khỏi màn hình
    const half = this.bossDef.hitRx * this.sc + 20;
    this.moveUfo(clamp(tx, Math.min(CX, half), Math.max(CX, W - half)), ty, 3, dt);
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
      this.smoke.push({ x: this.ux + rand(-0.5, 0.5) * this.bossDef.hitRx * this.sc, y: this.uy + rand(-20, 10), vx: rand(-20, 20), vy: rand(-90, -40), life: 0, max: rand(1.2, 2), size: rand(14, 26) });
    }
    for (const c of this.beams) {
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
        const x = this.ux + rand(-0.75, 0.75) * this.bossDef.hitRx * this.sc;
        const y = this.uy + (this.bossDef.hitCy + rand(-0.6, 0.6) * this.bossDef.hitRy) * this.sc;
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
      const big = clamp((this.bossDef.hitRx * this.sc) / 230, 1, 2.2);
      this.blasts.push({ x: this.ux, y: this.uy, t: this.time, color: "#ffffff", size: 420 * big });
      if (this.boss) for (let i = 0; i < 4; i++) this.firework(this.ux + rand(-200, 200), this.uy + rand(-120, 120), this.bossDef.color, 70);
      for (let i = 0; i < 3; i++) this.firework(this.ux + rand(-60, 60), this.uy + rand(-30, 30), FIREWORK[i], 90);
      this.sparks(this.ux, this.uy, 120, 1300);
      for (let i = 0; i < 46; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(200, 900);
        this.debris.push({ x: this.ux + rand(-0.5, 0.5) * this.bossDef.hitRx * this.sc, y: this.uy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 300, rot: rand(0, 6), vr: rand(-12, 12), w: rand(8, 34), h: rand(4, 14), life: rand(2, 3.5) });
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
      if (u >= 1 && u - dt / 0.95 < 1) this.sparks(this.ux + rand(-30, 30), this.uy + this.belly, 3, 140);
    }
    if (t >= LOSE_T) this.setPhase("break");
  }

  private shotTarget(s: Shot): [number, number] {
    if (s.drone) return [s.drone.x + s.ox * 0.1, s.drone.y + s.oy * 0.2];
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
        if (s.drone) {
          if (!s.drone.dead) this.hitDrone(s.drone, s.dmg, s.user, s.boost);
          this.sparks(x, y, 4, 300);
          continue;
        }
        const big = s.kind === "heavy" || s.kind === "mega";
        if (s.kind === "laser") this.sparks(x, y, 2, 240);
        else if (s.kind === "heart" || s.kind === "bill") this.sparks(x, y, 4, 320);
        else {
          if (s.fx === "rose") this.firework(x, y, "#ff5a8a", 24);
          if (s.fx === "confetti") {
            for (let i = 0; i < 70; i++) this.confetti.push({ x, y, vx: rand(-600, 600), vy: rand(-700, 100), rot: rand(0, 6), vr: rand(-12, 12), color: pick(CONFETTI), life: rand(1.5, 2.6) });
          }
          this.blasts.push({ x, y, t: this.time, color: s.color, size: big ? 200 : 90 });
          this.sparks(x, y, big ? 30 : 8, big ? 800 : 420);
          if (big) this.firework(x, y, s.color, 40);
          this.sfx.hit(big);
        }
        this.damage(s.user, s.dmg, x, y, big, s.boost);
      }
    }
    for (const s of this.shots) while (s.trail.length && this.time - s.trail[0].t > 0.8) s.trail.shift();
    this.shots = this.shots.filter((s) => !s.done || s.trail.length || this.time - s.t0 - s.dur < 0.2);
    this.beams = this.beams.filter((c) => this.time - c.t0 < c.dur + 0.4);
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
    for (const c of this.crates) if (c.openT < 0 && this.time - c.t0 >= 2.6) this.openCrate(c);
    this.crates = this.crates.filter((c) => c.openT < 0 || this.time - c.openT < 1.2);
    for (const f of this.confetti) {
      f.life -= dt;
      f.vx *= 1 - dt * 1.8;
      f.vy = f.vy * (1 - dt * 1.8) + 520 * dt;
      f.x += f.vx * dt + Math.sin(f.rot) * 30 * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
    }
    this.confetti = this.confetti.filter((f) => f.life > 0 && f.y < H + 20);
    if (this.confetti.length > 600) this.confetti.splice(0, this.confetti.length - 600);
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
    const orbital = this.beams.some((b) => b.style === "orbital" && this.time >= b.t0 - 0.4 && this.time < b.t0 + b.dur);
    if (orbital) {
      ctx.fillStyle = "rgba(0,4,24,0.4)";
      ctx.fillRect(-40, -40, W + 80, H + 80);
    }
    if (this.ufoAlive) this.drawUfo(ctx);
    this.drawAbilities(ctx);
    this.drawBeams(ctx);
    this.drawCrates(ctx);
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
      const my = this.uy + this.belly;
      const ang = p.p + su * Math.PI * 3;
      const sw = (1 - e) * 60;
      x = x + (mx - x) * e + Math.cos(ang) * sw;
      y = y + (my - y) * e + Math.sin(ang) * sw * 0.5;
      r *= 1 - 0.85 * e;
      rot = su * 5;
      glow = 0.3 + 0.5 * su;
    } else if (this.grab?.p === p) {
      // bị xúc tu nhấc lên
      const lift = clamp((this.time - this.grab.t0) / 6, 0, 1) * 0.55;
      y = lerp(y, this.uy + this.belly + 80, lift);
      rot = Math.sin(this.time * 8) * 0.3;
      glow = 0.5;
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
    if ((this.stun.get(p.user.id) ?? 0) > this.time) {
      ctx.fillStyle = "rgba(60,60,70,0.55)";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, "⚡", Math.sin(this.time * 9) * 4, 0, r * 0.9, "#ffd55a", "center", 400);
    }
    ctx.restore();
    if (p.suck < 0) {
      text(ctx, short(p.user.name, 12), x, y + r + 16, 17, "rgba(255,255,255,0.92)", "center", 700);
      const c = p.combo;
      if (c && this.time - c.t < 3) {
        const age = this.time - c.t;
        const pop = age < 0.15 ? 1 + 0.5 * (1 - age / 0.15) : 1;
        ctx.globalAlpha = clamp((3 - age) / 0.5, 0, 1);
        const busy = p.say && this.time - p.sayT < 2.6;
        text(ctx, `${c.icon} ×${c.n}`, clamp(x + r * 0.9, 60, W - 60), y - r - (busy ? 70 : 18), 28 * pop, "#ffd55a", "center", 900);
        ctx.globalAlpha = 1;
      }
      const sayAge = this.time - p.sayT;
      if (p.say && sayAge < 2.6) {
        ctx.globalAlpha = clamp(Math.min(sayAge * 6, (2.6 - sayAge) * 3), 0, 1);
        ctx.font = font(600, 20);
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
    const top = this.uy + this.belly;
    if (y < top) return 0;
    return 46 + (y - top) * 0.36;
  }

  /** Tia hút xanh lá của kẻ xâm lược (port từ tia hút Option 5) */
  private drawBeam(ctx: CanvasRenderingContext2D) {
    const k = this.beam;
    if (k < 0.02 || !this.ufoAlive) return;
    const top = this.uy + this.belly;
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

  // ================= kỹ năng trùm =================

  private freePeople() {
    return this.people.filter((p) => p.suck < 0 && p !== this.grab?.p && p.born <= this.time);
  }

  private eyePos(): [number, number] {
    return [this.ux + PLANET_EYE.x * this.sc, this.uy + PLANET_EYE.y * this.sc];
  }

  private updateAbility(dt: number) {
    const d = this.bossDef;
    const now = this.time;
    this.cloak = approach(this.cloak, this.cloaked ? 1 : 0, 5, dt);
    this.eyeBlast = Math.max(0, this.eyeBlast - dt * 0.7);
    this.muzzle = Math.max(0, this.muzzle - dt * 3);
    switch (d.ability) {
      case "grab": {
        // Bạch Tuộc: tóm 1 người, cả phòng dồn đủ sát thương trong 6 giây thì cứu được
        if (!this.grab && now >= this.abilityT) {
          this.abilityT = now + 13;
          const cand = this.freePeople().filter((p) => {
            const [x] = this.personPos(p);
            return x > 80 && x < W - 80;
          });
          if (cand.length) {
            const p = pick(cand);
            const need = Math.round(this.hpMax * 0.06);
            this.grab = { p, t0: now, need, dealt: 0 };
            this.toast(`🐙 Bạch tuộc tóm ${p.user.name}!`, `Dồn ${fmt(need)} sát thương trong 6s để cứu`, d.color, p.user, 3);
          }
        }
        const g = this.grab;
        if (g) {
          if (g.dealt >= g.need) {
            this.sparks(...this.personPos(g.p), 30, 600);
            this.toast(`Đã giải cứu ${g.p.user.name}!`, "Xúc tu bị bắn đứt", "#9dff7a", g.p.user, 2);
            this.grab = null;
          } else if (now - g.t0 > 6) {
            g.p.suck = now;
            this.progress = Math.min(1, this.progress + 0.03);
            this.toast(`${g.p.user.name} bị bạch tuộc bắt đi!`, "UFO hạ thêm 3 km", "#ff5a6e", g.p.user, 2);
            this.grab = null;
          }
        }
        break;
      }
      case "counter": {
        // Chiến Hạm Đỏ: bắn 3 quả cầu điện vào bong bóng người xem → choáng 5 giây
        if (now >= this.abilityT) {
          this.abilityT = now + 8;
          const cand = this.freePeople();
          for (let i = 0; i < 3 && cand.length; i++) {
            const p = cand.splice((Math.random() * cand.length) | 0, 1)[0];
            this.bolts.push({ p, t0: now + i * 0.18, x0: this.ux + rand(-0.6, 0.6) * d.hitRx * this.sc, y0: this.uy - 30 });
          }
          this.muzzle = 1;
          this.sfx.launch();
        }
        for (const b of this.bolts) {
          if (now - b.t0 < 0.55) continue;
          this.stun.set(b.p.user.id, now + 5);
          const [x, y] = this.personPos(b.p);
          this.sparks(x, y, 10, 400);
          this.floatText("⚡ CHOÁNG", x, y - 60, "#ff5a6e", 26);
          b.t0 = -99;
        }
        this.bolts = this.bolts.filter((b) => b.t0 > -50);
        break;
      }
      case "shield":
        // Pháo Đài Tinh Thể: khiên vỡ 12 giây sau thì tự hồi
        if (this.shieldHp <= 0 && now >= this.abilityT) {
          this.shieldHp = this.shieldMax;
          this.toast("🛡 KHIÊN TINH THỂ HỒI PHỤC!", `Phá ${fmt(this.shieldMax)} khiên rồi mới đánh vào thân`, d.color, undefined, 2);
        }
        break;
      case "drones": {
        // Phi Thuyền Mẹ: cứ 7 giây thả 2 UFO con (tối đa 6), chạm phố là bắt 1 người
        if (now >= this.abilityT) {
          this.abilityT = now + 7;
          const alive = this.drones.filter((x) => !x.dead).length;
          for (let i = 0; i < Math.min(2, 6 - alive); i++) {
            const x0 = this.ux + rand(-0.5, 0.5) * d.hitRx * this.sc;
            const y0 = this.uy + this.belly;
            const max = Math.max(20, Math.round(this.hpMax * 0.02));
            this.drones.push({ x: x0, y: y0, x0, y0, tx: rand(120, W - 120), t0: now + i * 0.5, hp: max, max, dead: false });
          }
        }
        for (const dr of this.drones) {
          if (dr.dead || now < dr.t0) continue;
          const u = clamp((now - dr.t0) / 10, 0, 1);
          dr.x = lerp(dr.x0, dr.tx, u) + Math.sin(now * 2 + dr.t0) * 30;
          dr.y = lerp(dr.y0, PEOPLE_Y0 - 30, u);
          if (u >= 1) {
            dr.dead = true;
            let best: Person | null = null;
            let bd = Infinity;
            for (const p of this.freePeople()) {
              const [px, py] = this.personPos(p);
              const dd = Math.hypot(px - dr.x, py - dr.y);
              if (dd < bd) {
                bd = dd;
                best = p;
              }
            }
            if (best) {
              best.suck = now;
              this.toast(`UFO con bắt mất ${best.user.name}!`, "Bắn rơi UFO con trước khi chạm phố", "#ff5a6e", best.user, 1);
            }
            this.progress = Math.min(1, this.progress + 0.015);
          }
        }
        this.drones = this.drones.filter((x) => !x.dead);
        break;
      }
      case "charge": {
        // Hành Tinh Hủy Diệt: sạc 5 giây; đủ sát thương thì ngắt, không thì bắn — UFO tụt 8 km
        if (!this.charge && now >= this.abilityT) {
          const need = Math.round(this.hpMax * 0.07);
          this.charge = { t0: now, need, dealt: 0 };
          this.toast("👁 MẮT HỦY DIỆT ĐANG SẠC!", `Dồn ${fmt(need)} sát thương trong 5s để ngắt`, d.color, undefined, 3);
          this.sfx.siren();
        }
        const c = this.charge;
        if (c) {
          if (c.dealt >= c.need) {
            this.charge = null;
            this.abilityT = now + 12;
            this.toast("✅ NGẮT SẠC THÀNH CÔNG!", "Mắt hủy diệt bị choáng", "#9dff7a", undefined, 3);
            this.sparks(...this.eyePos(), 50, 800);
            this.sfx.win();
          } else if (now - c.t0 >= 5) {
            this.charge = null;
            this.abilityT = now + 12;
            this.eyeBlast = 1;
            this.progress = Math.min(1, this.progress + 0.08);
            this.shake = 34;
            this.flash = 0.45;
            this.sfx.boom();
            this.toast("💥 PHÁO HỦY DIỆT KHAI HỎA!", "UFO bị đẩy sát mặt đất thêm 8 km", d.color, undefined, 3);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private hitDrone(dr: Drone, dmg: number, user: LiveUser, boost: boolean) {
    if (this.phase !== "battle") return;
    if (boost && this.golden) dmg *= 2;
    dr.hp -= dmg;
    const rec = this.roundDmg.get(user.id) ?? { user, dmg: 0 };
    rec.dmg += Math.max(0, Math.min(dmg, dr.hp + dmg));
    this.roundDmg.set(user.id, rec);
    if (dr.hp <= 0 && !dr.dead) {
      dr.dead = true;
      this.blasts.push({ x: dr.x, y: dr.y, t: this.time, color: "#ffb15a", size: 120 });
      this.firework(dr.x, dr.y, "#ffb15a", 30);
      this.floatText(`💥 ${short(user.name, 10)} hạ UFO con`, dr.x, dr.y - 40, "#ffb15a", 26);
      this.sfx.hit(true);
    }
  }

  /** Lời nhắc kỹ năng trùm đang diễn ra (thay dòng gợi ý) */
  private abilityLine(): [string, string] | null {
    const now = this.time;
    if (this.grab) return [`🐙 CỨU ${short(this.grab.p.user.name, 12).toUpperCase()}: ${fmt(this.grab.dealt)}/${fmt(this.grab.need)} · còn ${Math.ceil(6 - (now - this.grab.t0))}s`, "#d58bff"];
    if (this.charge) return [`👁 NGẮT SẠC: ${fmt(this.charge.dealt)}/${fmt(this.charge.need)} · còn ${Math.ceil(5 - (now - this.charge.t0))}s`, "#ff5a5a"];
    if (this.cloaked) return ["👻 TÀU ĐANG TÀNG HÌNH — 70% ĐẠN BẮN TRƯỢT!", "#7fd8ff"];
    if (this.shieldHp > 0) return [`🛡 KHIÊN TINH THỂ: ${fmt(this.shieldHp)} — PHÁ KHIÊN TRƯỚC!`, "#7ff0ff"];
    const drones = this.drones.filter((d) => !d.dead).length;
    if (drones) return [`🛸 ${drones} UFO CON ĐANG LAO XUỐNG — BẮN RƠI NGAY!`, "#ffb15a"];
    for (const [, t] of this.stun) if (t > now) return ["⚡ CHIẾN HẠM PHẢN CÔNG — NGƯỜI BỊ CHOÁNG GIẢM 50% SÁT THƯƠNG", "#ff7a8a"];
    return null;
  }

  // ================= vẽ trùm =================

  private drawUfo(ctx: CanvasRenderingContext2D) {
    const d = this.bossDef;
    if (d.id === "ufo" || d.id === "gold") {
      this.drawSaucer(ctx);
      return;
    }
    const t = this.time;
    const img = this.sprite(d.id);
    const alpha = 1 - 0.85 * this.cloak;
    ctx.save();
    ctx.translate(this.ux, this.uy);
    ctx.rotate(this.tilt * 0.6);
    ctx.scale(this.sc, this.sc);
    // hào quang trùm mốc
    if (d.kind === "milestone") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 3);
      const gi = d.id === "crystal" ? 2 : d.id === "mother" ? 0 : 1;
      ctx.drawImage(this.glows[gi], -d.w * 0.6, -d.h * 0.55, d.w * 1.2, d.h * 1.1);
      ctx.restore();
    }
    if (d.id === "octopus") this.drawTentacles(ctx, alpha);
    if (d.id === "crystal") this.drawCrystalRings(ctx, false);
    if (d.id === "cruiser") {
      // lửa phụt đuôi
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const ey of [132, 160, 188]) {
        const fl = 70 + Math.random() * 30;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(this.glows[2], -d.cx + 55 - fl, ey - d.cy - 16, fl, 32);
      }
      ctx.restore();
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -d.cx, -d.cy);
    if (this.hitFlash > 0.02) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = this.hitFlash * 0.28 * alpha;
      ctx.drawImage(img, -d.cx, -d.cy);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    switch (d.id) {
      case "octopus": {
        const blink = (t % 4) < 0.15 ? 0.1 : 1;
        for (const sx of [-66, 66]) {
          ctx.globalAlpha = alpha * (0.45 + 0.25 * Math.sin(t * 5)) * blink;
          ctx.drawImage(this.glows[0], sx - 55, -55 - 45, 110, 90);
        }
        break;
      }
      case "stealth": {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6);
        ctx.drawImage(this.glows[1], -70, -28 - 30, 140, 60);
        if (this.cloak > 0.05) {
          // viền lấp lánh lúc tàng hình — vẫn thấy lờ mờ hình tàu
          ctx.globalAlpha = this.cloak * (0.5 + 0.5 * Math.sin(t * 20));
          ctx.strokeStyle = "rgba(120,240,255,0.9)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-370, 30);
          ctx.lineTo(0, -84);
          ctx.lineTo(370, 30);
          ctx.stroke();
        }
        break;
      }
      case "cruiser": {
        for (let i = 0; i < 8; i++) {
          if (Math.sin(t * 4 + i * 1.3) < 0.3) continue;
          ctx.drawImage(this.glows[1], -380 + i * 100 - 10, 30, 20, 20);
        }
        if (this.muzzle > 0) {
          ctx.globalAlpha = this.muzzle;
          for (const tx of [260, 350, 570, 650]) ctx.drawImage(this.glows[1], tx - d.cx + 56 - 40, -84 - 40, 80, 80);
        }
        break;
      }
      case "crystal": {
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3);
        ctx.drawImage(this.glows[2], -130, -130, 260, 260);
        ctx.globalAlpha = 1;
        this.drawCrystalRings(ctx, true);
        if (this.shieldHp > 0) {
          const k = this.shieldHp / Math.max(1, this.shieldMax);
          ctx.strokeStyle = `rgba(127,240,255,${0.35 + 0.4 * k})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(0, 0, 330, 330, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.18 + 0.2 * k;
          ctx.lineWidth = 2;
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + t * 0.3;
            ctx.beginPath();
            ctx.ellipse(0, 0, 330 * Math.abs(Math.cos(a)), 330, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        break;
      }
      case "mother": {
        for (let i = -2; i <= 2; i++) {
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + i);
          ctx.drawImage(this.glows[0], i * 150 - 60, 92 - Math.abs(i) * 14 - 30, 120, 60);
        }
        ctx.globalAlpha = Math.sin(t * 4) > 0 ? 1 : 0.2;
        for (const [tx, ty] of [[-220, -210], [220, -210], [-110, -180], [110, -180]] as const) ctx.drawImage(this.glows[1], tx - 20, ty - 20, 40, 40);
        break;
      }
      case "planet": {
        // mắt: đồng tử đỏ, sạc thì to & trắng dần
        const ck = this.charge ? clamp((t - this.charge.t0) / 5, 0, 1) : 0;
        const ex = PLANET_EYE.x;
        const ey = PLANET_EYE.y;
        ctx.globalCompositeOperation = "source-over";
        const iris = ctx.createRadialGradient(ex, ey, 2, ex, ey, 58);
        iris.addColorStop(0, ck > 0.5 ? "#ffffff" : "#ffd0a0");
        iris.addColorStop(0.25 + 0.2 * ck, "#ff3b3b");
        iris.addColorStop(1, "#3a0000");
        ctx.fillStyle = iris;
        ctx.beginPath();
        ctx.ellipse(ex, ey, 70, 46, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#120000";
        ctx.beginPath();
        ctx.ellipse(ex + Math.sin(t * 0.7) * 14, ey, 9 + 10 * ck, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.4 + 0.6 * ck;
        ctx.drawImage(this.glows[1], ex - 120 - 80 * ck, ey - 90 - 60 * ck, 240 + 160 * ck, 180 + 120 * ck);
        if (this.charge) {
          for (let i = 0; i < 4; i++) {
            const f = 1 - ((t * 1.4 + i / 4) % 1);
            ctx.globalAlpha = (1 - f) * 0.9;
            ctx.strokeStyle = "#ff5a5a";
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.ellipse(ex, ey, 70 + f * 260, 46 + f * 170, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 2);
        ctx.drawImage(this.glows[1], -230, -230, 460, 460);
        break;
      }
    }
    // hư hại nặng: lửa cháy trên thân
    if (this.hp / this.hpMax < 0.3) {
      for (const [fx, fy] of [[-0.6, -0.2], [0.45, 0.1], [0.1, -0.5]] as const) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 20 + fx * 10);
        const s = 60 + 14 * Math.sin(t * 13 + fy * 10);
        ctx.drawImage(this.glows[1], fx * d.hitRx - s, (d.hitCy + fy * d.hitRy) - s, s * 2, s * 2);
      }
    }
    ctx.restore();
  }

  /** Xúc tu bạch tuộc uốn lượn dưới bụng */
  private drawTentacles(ctx: CanvasRenderingContext2D, alpha: number) {
    const t = this.time;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 8; i++) {
      const bx = -210 + i * 60;
      const len = 200 + (i % 3) * 40;
      for (let k = 0; k <= 16; k++) {
        const u = k / 16;
        const x = bx + Math.sin(t * 2.2 + i * 0.9 + u * 4) * 34 * u + bx * 0.3 * u;
        const y = 60 + u * len;
        const r = 20 * (1 - u) + 4;
        ctx.fillStyle = `hsl(${285 + u * 15},55%,${34 + 14 * u}%)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (k % 3 === 1) {
          ctx.fillStyle = "rgba(255,200,240,0.55)";
          ctx.beginPath();
          ctx.arc(x - r * 0.4, y, r * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  /** Hai vòng phù văn quay quanh Pháo Đài Tinh Thể (vẽ nửa sau trước thân, nửa trước sau thân) */
  private drawCrystalRings(ctx: CanvasRenderingContext2D, front: boolean) {
    const t = this.time;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [rx, ry, tilt, sp] of [[300, 70, -0.25, 0.6], [260, 60, 0.3, -0.8]] as const) {
      ctx.save();
      ctx.rotate(tilt);
      ctx.strokeStyle = "rgba(160,240,255,0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 40, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + t * sp;
        const inFront = Math.sin(a) > 0;
        if (inFront !== front) continue;
        ctx.drawImage(this.glows[2], Math.cos(a) * rx - 12, 40 + Math.sin(a) * ry - 12, 24, 24);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /** Lớp kỹ năng trên sân khấu: xúc tu tóm người, cầu điện phản công, UFO con, tia hủy diệt */
  private drawAbilities(ctx: CanvasRenderingContext2D) {
    const now = this.time;
    const g = this.grab;
    if (g && this.ufoAlive) {
      const [px, py] = this.personPos(g.p);
      const lift = clamp((now - g.t0) / 6, 0, 1) * 0.55;
      const ty = lerp(py, this.uy + this.belly + 80, lift);
      const sx = this.ux + Math.sin(now * 2) * 30;
      const sy = this.uy + this.belly;
      for (const [w, col] of [[26, "#5a1f7a"], [16, "#b04fd0"]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx + 160 * Math.sin(now * 3), sy + 120, px - 120 * Math.cos(now * 2.5), ty - 120, px, ty - 30);
        ctx.stroke();
      }
      const k = clamp(g.dealt / g.need, 0, 1);
      const bw = 180;
      ctx.fillStyle = "rgba(10,12,24,0.8)";
      ctx.fillRect(px - bw / 2, ty - 100, bw, 14);
      ctx.fillStyle = "#9dff7a";
      ctx.fillRect(px - bw / 2, ty - 100, bw * k, 14);
      text(ctx, `CỨU ${short(g.p.user.name, 10)}!`, px, ty - 118, 24, "#ffffff", "center", 900);
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.bolts) {
      const u = clamp((now - b.t0) / 0.55, 0, 1);
      if (now < b.t0) continue;
      const [px, py] = this.personPos(b.p);
      const x = lerp(b.x0, px, u);
      const y = lerp(b.y0, py, u) - Math.sin(u * Math.PI) * 80;
      ctx.drawImage(this.glows[1], x - 34, y - 34, 68, 68);
      ctx.drawImage(this.glows[2], x - 14, y - 14, 28, 28);
    }
    ctx.restore();
    for (const dr of this.drones) {
      if (dr.dead || now < dr.t0) continue;
      const u = clamp((now - dr.t0) / 10, 0, 1);
      if (u > 0.6) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (u - 0.6) * 1.5;
        ctx.fillStyle = "rgba(130,255,170,0.25)";
        ctx.beginPath();
        ctx.moveTo(dr.x - 12, dr.y + 10);
        ctx.lineTo(dr.x + 12, dr.y + 10);
        ctx.lineTo(dr.x + 50, dr.y + 140);
        ctx.lineTo(dr.x - 50, dr.y + 140);
        ctx.fill();
        ctx.restore();
      }
      const ds = 0.2;
      ctx.drawImage(this.sprite("ufo"), dr.x - SCX * ds, dr.y - SCY * ds, this.sprite("ufo").width * ds, this.sprite("ufo").height * ds);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now * 12 + dr.t0);
      ctx.drawImage(this.glows[1], dr.x - 20, dr.y, 40, 24);
      ctx.restore();
      ctx.fillStyle = "rgba(10,12,24,0.8)";
      ctx.fillRect(dr.x - 40, dr.y - 40, 80, 8);
      ctx.fillStyle = "#ffb15a";
      ctx.fillRect(dr.x - 40, dr.y - 40, 80 * clamp(dr.hp / dr.max, 0, 1), 8);
    }
    if (this.eyeBlast > 0 && this.ufoAlive) {
      const [ex, ey] = this.eyePos();
      const k = this.eyeBlast;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const [w, col] of [[260, "rgba(255,40,40,0.25)"], [140, "rgba(255,120,80,0.5)"], [50, "rgba(255,240,220,0.95)"]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w * k;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex, H);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawSaucer(ctx: CanvasRenderingContext2D) {
    const danger = this.phase === "battle" && this.progress > 0.75;
    const hot = Math.max(this.beam, 0.4 + this.progress * 0.6);
    ctx.save();
    ctx.translate(this.ux, this.uy);
    ctx.rotate(this.tilt);
    ctx.scale(this.sc, this.sc);
    // quầng sáng trùm vàng
    if (this.bossDef.id === "gold") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.time * 4);
      ctx.drawImage(this.glows[0], -SCX * 0.9, -SCY * 0.9, SCX * 1.8, SCY * 1.4);
      ctx.restore();
    }
    const body = this.sprite(this.bossDef.id);
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
        if (!isRocket(s.kind)) continue;
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
      if (!isRocket(s.kind) || s.done || this.time < s.t0) continue;
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
    // vệt sáng đạn trái tim
    for (const s of this.shots) {
      if (s.kind !== "heart") continue;
      for (const p of s.trail) {
        const k = 1 - (this.time - p.t) / 0.8;
        if (k <= 0) continue;
        ctx.globalAlpha = 0.5 * k;
        ctx.drawImage(this.glows[1], p.x - 10, p.y - 10, 20, 20);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // đạn trái tim & tờ tiền
    for (const s of this.shots) {
      if ((s.kind !== "heart" && s.kind !== "bill") || s.done || this.time < s.t0) continue;
      const { x, y, ang } = this.rocketPose(s);
      ctx.save();
      ctx.translate(x, y);
      if (s.kind === "heart") {
        const k = 1 + 0.15 * Math.sin(this.time * 20 + s.side);
        ctx.scale(k, k);
        drawHeart(ctx, 0, 0, 16, "#ff4f86");
      } else {
        ctx.rotate(ang + Math.sin(this.time * 14 + s.side) * 0.5);
        ctx.fillStyle = "#2fbf5f";
        ctx.fillRect(-20, -10, 40, 20);
        ctx.strokeStyle = "#c9ffd6";
        ctx.lineWidth = 2;
        ctx.strokeRect(-17, -7, 34, 14);
        ctx.fillStyle = "#eafff0";
        ctx.font = font(700, 13);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("$", 0, 1);
      }
      ctx.restore();
    }
    // thân tên lửa (+ người tặng ngồi trong ô cửa với tên lửa hạng nặng)
    for (const s of this.shots) {
      if (!isRocket(s.kind) || s.done || this.time < s.t0) continue;
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
      if (s.kind !== "rocket" && s.label) text(ctx, short(s.user.name, 14), x, y + 22 * sc, 22, "#ffd55a", "center", 800);
    }
  }

  private rocketPose(s: Shot) {
    const u = clamp((this.time - s.t0) / s.dur, 0, 1);
    const uu = ease(u);
    const [x, y] = this.shotPos(s, uu);
    const [qx, qy] = this.shotPos(s, Math.min(1, uu + 0.02));
    return { x, y, ang: Math.atan2(qy - y, qx - x), sc: s.kind === "heavy" ? 2.2 : s.kind === "mega" ? 2.9 : 1.3 };
  }

  /** Tia năng lượng: PHÁO TRÁI ĐẤT (từ mặt đất), laser đôi kính râm (từ bong bóng), tia vũ trụ (từ quỹ đạo) */
  private drawBeams(ctx: CanvasRenderingContext2D) {
    if (!this.ufoAlive) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const line = (x0: number, y0: number, x1: number, y1: number, w: number, col: string) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };
    for (const b of this.beams) {
      const u = (this.time - b.t0) / b.dur;
      if (u < 0 || u > 1.15) continue;
      const k = (u < 0.08 ? u / 0.08 : u > 1 ? 1 - (u - 1) / 0.15 : 1) * (0.9 + 0.1 * Math.sin(this.time * 40));
      const x1 = this.ux;
      const y1 = this.uy + 20;
      if (b.style === "earth") {
        for (const [w, col] of [[120, "rgba(255,90,110,0.25)"], [70, "rgba(255,160,120,0.45)"], [30, "rgba(255,240,220,0.9)"]] as const) line(b.x, b.y, x1, y1, w * k, col);
        ctx.globalAlpha = k;
        ctx.drawImage(this.glows[1], x1 - 160, y1 - 160, 320, 320);
        ctx.drawImage(this.glows[0], b.x - 120, b.y - 120, 240, 240);
        ctx.globalAlpha = 1;
        text(ctx, short(b.user.name, 16), b.x, b.y - 150, 30, "#fff", "center", 900);
      } else if (b.style === "twin") {
        // hai tia từ "kính râm" của người tặng, quét nhẹ trên thân đĩa
        const sweep = Math.sin(this.time * 6) * 0.2 * this.bossDef.hitRx * this.sc;
        for (const [dx, col] of [[-16, "rgba(255,80,220,0.8)"], [16, "rgba(90,220,255,0.8)"]] as const) {
          line(b.x + dx, b.y, x1 + sweep + dx * 3, y1, 16 * k, col);
          line(b.x + dx, b.y, x1 + sweep + dx * 3, y1, 5 * k, "rgba(255,255,255,0.95)");
          ctx.globalAlpha = k;
          ctx.drawImage(this.glows[2], x1 + sweep + dx * 3 - 50, y1 - 50, 100, 100);
          ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = "source-over";
        text(ctx, "😎", b.x, b.y - 4, 44, "#fff", "center", 400);
        ctx.globalCompositeOperation = "lighter";
      } else {
        // cột sáng khổng lồ từ quỹ đạo xuống thẳng UFO
        const x0 = x1 + Math.sin(this.time * 3) * 10;
        for (const [w, col] of [[300, "rgba(90,160,255,0.18)"], [170, "rgba(140,200,255,0.35)"], [70, "rgba(235,245,255,0.95)"]] as const) line(x0, -60, x1, y1, w * k, col);
        ctx.globalAlpha = k;
        ctx.drawImage(this.glows[2], x1 - 260, y1 - 200, 520, 400);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /** Rương xu: dù sọc đỏ trắng + thùng gỗ viền vàng có ảnh người thả */
  private drawCrates(ctx: CanvasRenderingContext2D) {
    for (const c of this.crates) {
      const x = this.crateX(c);
      const y = this.crateY(c);
      const opened = c.openT >= 0;
      const fade = opened ? clamp(1 - (this.time - c.openT) / 1.2, 0, 1) : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      if (!opened) {
        const cy = y - 150;
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 ? "#f4f4f4" : "#e63950";
          ctx.beginPath();
          ctx.moveTo(x, cy);
          ctx.arc(x, cy, 90, Math.PI + (i * Math.PI) / 6, Math.PI + ((i + 1) * Math.PI) / 6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const dx of [-88, -40, 40, 88]) {
          ctx.moveTo(x + dx, cy);
          ctx.lineTo(x + dx * 0.3, y - 30);
        }
        ctx.stroke();
      } else {
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(this.glows[0], x - 160, y - 200, 320, 320);
        ctx.globalCompositeOperation = "source-over";
      }
      // thùng
      ctx.fillStyle = "#7a4a22";
      ctx.fillRect(x - 46, y - 34, 92, 64);
      ctx.fillStyle = "#ffd55a";
      ctx.fillRect(x - 46, y - 8, 92, 10);
      ctx.fillRect(x - 5, y - 34, 10, 64);
      if (!opened) {
        ctx.fillStyle = "#5d3618";
        ctx.fillRect(x - 50, y - 44, 100, 14);
      }
      ctx.drawImage(this.avatars.get(c.user), x - 20, y - 26, 40, 40);
      text(ctx, `${fmt(c.coins)} xu`, x, y + 48, 22, "#ffd55a", "center", 900);
      ctx.restore();
    }
  }

  private drawFx(ctx: CanvasRenderingContext2D) {
    for (const f of this.confetti) {
      ctx.save();
      ctx.globalAlpha = clamp(f.life / 0.5, 0, 1);
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.fillStyle = f.color;
      ctx.fillRect(-7, -4, 14, 8 * Math.abs(Math.cos(f.rot * 1.3)) + 1);
      ctx.restore();
    }
    // mảnh vỡ
    for (const d of this.debris) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = this.bossDef.id === "gold" ? "#b8913c" : this.bossDef.id === "octopus" ? "#8a4fb0" : this.bossDef.id === "crystal" ? "#7fd8ff" : "#59606c";
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
      const secs = Math.ceil((1 - this.progress) * this.battleTime);
      ctx.globalAlpha = 0.65 + 0.35 * pulse;
      text(ctx, "⚠ UFO SẮP CHẠM ĐẤT ⚠", CX, 750, 52, "#ff4b5c", "center", 900);
      text(ctx, `THẢ TIM NGAY! CÒN ${secs} GIÂY`, CX, 808, 34, "#ffffff", "center", 800);
      ctx.globalAlpha = 1;
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const showBar = this.phase !== "break" && (this.phase !== "lose" || this.phaseT < 5.6);
    // tiêu đề + tỉ số
    const d = this.bossDef;
    const bossOn = this.boss && this.phase !== "break";
    fitText(ctx, bossOn ? `★ ${this.bossLabel()}: ${d.name.toUpperCase()} ★` : "BẢO VỆ TRÁI ĐẤT", CX, SAFE.top + 22, bossOn ? 30 : 34, W - 120, bossOn ? d.color : "#9dff7a");
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
        g.addColorStop(0, "#ff2e55");
        g.addColorStop(1, d.color);
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
      // khiên tinh thể phủ lên thanh máu
      if (this.shieldHp > 0) {
        ctx.fillStyle = "rgba(127,240,255,0.55)";
        ctx.beginPath();
        ctx.roundRect(x, y + h - 12, Math.max(12, w * clamp(this.shieldHp / this.hpMax, 0, 1)), 12, 6);
        ctx.fill();
      }
      const hpTxt = `${this.boss ? "☠" : "👽"} ${fmt(this.hp <= 0 ? 0 : Math.max(1, Math.round(this.hpShown)))} / ${fmt(this.hpMax)}${this.shieldHp > 0 ? `  🛡 ${fmt(this.shieldHp)}` : ""}`;
      text(ctx, hpTxt, CX, y + h / 2 + 1, 24, "#fff", "center", 900);
    }
    fitText(ctx, `VÒNG ${Math.max(1, this.round)} · 🌍 ${this.earthWins} : ${this.ufoWins} 👽 · 🔥 CHUỖI ${this.streak}/${nextMilestone(this.streak)}`, CX, SAFE.top + 128, 26, W - 140, "rgba(255,255,255,0.92)", 800);

    if (this.phase === "battle") {
      // gợi ý luân phiên
      const tip = TIPS[Math.floor(this.time / 3.5) % TIPS.length];
      this.drawFund(ctx);
      const ab = this.abilityLine();
      if (ab) {
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.time * 8);
        fitText(ctx, ab[0], CX, SAFE.top + 206, 26, W - 100, ab[1]);
        ctx.globalAlpha = 1;
      } else if (this.progress <= 0.75) text(ctx, tip, CX, SAFE.top + 206, 26, "#ffe08a", "center", 800);
      this.drawAltimeter(ctx);
      // bảng TOP XẠ THỦ (góc phải, y 520–720) mờ đi khi thân trùm che lên
      const d2 = this.bossDef;
      const over = this.ufoAlive && this.ux + d2.hitRx * this.sc > W - 320 && Math.abs(this.uy + d2.hitCy * this.sc - 620) < d2.hitRy * this.sc + 120;
      this.topAlpha = approach(this.topAlpha, over ? 0.18 : 1, 6, 1 / 60);
      if (this.progress <= 0.75) {
        ctx.globalAlpha = this.topAlpha;
        this.drawTopShooters(ctx);
        ctx.globalAlpha = 1;
      }
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

  /** Quỹ phòng thủ (xu cả phòng góp) → ĐẠN VÀNG ×2; khi đang bật thì hiện thời gian còn lại */
  private drawFund(ctx: CanvasRenderingContext2D) {
    const w = 620;
    const h = 30;
    const x = CX - w / 2;
    const y = SAFE.top + 152;
    ctx.fillStyle = "rgba(10,12,24,0.75)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 15);
    ctx.fill();
    const gold = this.golden;
    const k = gold ? clamp((this.goldUntil - this.time) / Math.max(this.bal.goldTime, 1), 0, 1) : clamp(this.fund / this.fundGoal, 0, 1);
    if (k > 0) {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, "#c98a1a");
      g.addColorStop(1, "#ffe27a");
      ctx.fillStyle = g;
      ctx.globalAlpha = gold ? 0.75 + 0.25 * Math.sin(this.time * 10) : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(h, w * k), h, 15);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const label = gold
      ? `⚡ ĐẠN VÀNG ×2 · còn ${Math.ceil(this.goldUntil - this.time)}s`
      : `🪙 QUỸ PHÒNG THỦ ${fmt(this.fund)} / ${fmt(this.fundGoal)} xu → ĐẠN VÀNG ×2`;
    text(ctx, label, CX, y + h / 2 + 1, 18, "#fff", "center", 800);
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
      ctx.font = font(700, s);
      const half = ctx.measureText(f.text).width / 2 + 12;
      text(ctx, f.text, clamp(f.x, half, W - half), f.y - age * 70, s, f.color, "center", 900);
    }
    ctx.globalAlpha = 1;
  }

  private drawPhaseOverlay(ctx: CanvasRenderingContext2D) {
    const t = this.phaseT;
    const d = this.bossDef;
    if (this.phase === "intro") {
      const blink = Math.sin(this.time * 9) > -0.2;
      const k = clamp(t / 0.3, 0, 1) * clamp((this.introDur - t) / 0.4, 0, 1);
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
      if (this.boss) {
        if (blink) fitText(ctx, `⚠ ${this.bossLabel()} XUẤT HIỆN ⚠`, CX, 775, 50, W - 80, "#fff");
        fitText(ctx, d.name.toUpperCase(), CX, 845, 52, W - 80, d.color);
        // thẻ sức mạnh
        if (t > 1.2) {
          ctx.globalAlpha = k * clamp((t - 1.2) / 0.4, 0, 1);
          ctx.fillStyle = "rgba(8,10,24,0.85)";
          ctx.beginPath();
          ctx.roundRect(90, 920, W - 180, 230, 28);
          ctx.fill();
          ctx.strokeStyle = d.color;
          ctx.lineWidth = 3;
          ctx.stroke();
          text(ctx, `${"★".repeat(d.stars)}${"☆".repeat(5 - d.stars)}`, CX, 965, 40, d.color, "center", 900);
          text(ctx, `MÁU ×${d.hpMul}   ·   THỜI GIAN ×${d.timeMul}`, CX, 1015, 26, "#ffffff", "center", 800);
          wrapText(ctx, d.power, CX, 1065, W - 260, 26, "#ffe08a");
        }
      } else {
        if (blink) text(ctx, "⚠ CẢNH BÁO ⚠", CX, 775, 58, "#fff", "center", 900);
        text(ctx, "UFO XÂM LƯỢC ĐANG HẠ CÁNH!", CX, 845, 42, "#ffe08a", "center", 900);
      }
      ctx.globalAlpha = 1;
    } else if (this.phase === "win" && t > 1.7) {
      const k = easeOutBack(clamp((t - 1.7) / 0.5, 0, 1));
      const fade = clamp((WIN_T - t) / 0.6, 0, 1);
      ctx.globalAlpha = fade;
      ctx.save();
      ctx.translate(CX, 640);
      ctx.scale(k, k);
      if (this.boss) {
        fitText(ctx, `HẠ GỤC ${d.name.toUpperCase()}!`, 0, -30, 70, W - 80, d.color);
        text(ctx, `🔥 CHUỖI THẮNG ${this.streak}${this.streak >= this.bestStreak && this.streak > 1 ? " · KỶ LỤC MỚI!" : ""}`, 0, 40, 34, "#ffffff", "center", 900);
      } else text(ctx, "TRÁI ĐẤT AN TOÀN!", 0, 0, 78, "#9dff7a", "center", 900);
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
        if (this.lostStreak > 1) text(ctx, `💔 Chuỗi ${this.lostStreak} trận thắng bị ${this.boss ? d.name : "UFO"} cắt đứt`, CX, 780, 30, "#ff8a8a", "center", 800);
        else text(ctx, "Thả tim để phục thù ở vòng sau!", CX, 780, 30, "#fff", "center", 700);
      }
      ctx.globalAlpha = 1;
    } else if (this.phase === "break") {
      const k = clamp(t / 0.4, 0, 1) * clamp((BREAK_T - t) / 0.3, 0, 1);
      ctx.globalAlpha = k;
      ctx.fillStyle = "rgba(5,8,20,0.55)";
      ctx.beginPath();
      ctx.roundRect(110, 560, W - 220, 420, 32);
      ctx.fill();
      text(ctx, this.round === 0 ? "SẴN SÀNG BẢO VỆ TRÁI ĐẤT?" : "MỌI NGƯỜI ĐÃ ĐƯỢC THẢ VỀ", CX, 620, 36, "#9dff7a", "center", 900);
      text(ctx, "VÒNG TIẾP THEO SAU", CX, 690, 30, "#fff", "center", 800);
      text(ctx, `${Math.max(0, Math.ceil(BREAK_T - t))}`, CX, 790, 120, "#ffd55a", "center", 900);
      // chuỗi thắng & trùm mốc kế tiếp: giữ người xem ở lại
      const next = nextMilestone(this.streak);
      const nb = BOSSES[milestoneBoss(next)];
      if (isMilestone(this.streak)) {
        ctx.globalAlpha = k * (0.7 + 0.3 * Math.sin(this.time * 8));
        fitText(ctx, `⚠ VÒNG SAU: TRÙM ${BOSSES[milestoneBoss(this.streak)].name.toUpperCase()}!`, CX, 878, 32, W - 260, BOSSES[milestoneBoss(this.streak)].color);
        ctx.globalAlpha = k;
      } else {
        fitText(ctx, `🔥 Chuỗi thắng ${this.streak} · thắng thêm ${next - this.streak} trận gặp ${nb.name}`, CX, 878, 26, W - 260, "#ffd55a", 800);
      }
      text(ctx, `Kỷ lục chuỗi: ${this.bestStreak}`, CX, 918, 22, "rgba(255,255,255,0.7)", "center", 700);
      text(ctx, "❤️ tim · 💬 bình luận · 🎁 quà · ➕ follow", CX, 955, 24, "rgba(255,255,255,0.85)", "center", 700);
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
    const y = SAFE.top + 236;
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
    if (b.sub) text(ctx, short(b.sub, 44), tx, y + 76, 24, "rgba(255,255,255,0.88)", "left", 700);
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

/** Trái tim (tâm x,y, cỡ s) */
function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath();
  ctx.ellipse(x - s * 0.45, y - s * 0.35, s * 0.22, s * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** Chữ tự thu nhỏ cho vừa bề rộng */
function fitText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, maxW: number, color: string, weight = 900) {
  ctx.font = font(weight, size);
  ctx.letterSpacing = size >= 28 ? "1px" : "0px";
  const w = ctx.measureText(str).width;
  text(ctx, str, x, y, w > maxW ? Math.floor((size * maxW) / w) : size, color, "center", weight);
}

/** Chữ xuống dòng theo bề rộng (căn giữa) */
function wrapText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, maxW: number, size: number, color: string) {
  ctx.font = font(600, size);
  const lines: string[] = [];
  let line = "";
  for (const word of str.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => text(ctx, l, x, y + i * size * 1.3, size, color, "center", 700));
}

/** Chữ có viền tối để đọc được trên mọi nền */
function text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center", weight = 800) {
  ctx.font = font(weight, size);
  ctx.letterSpacing = size >= 28 ? "1px" : "0px";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.letterSpacing = "0px";
}

