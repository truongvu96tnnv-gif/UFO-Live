import { cleanChat, cleanName } from "../live/filter";
import type { LiveEvent, LiveUser } from "../live/events";
import { isBossId } from "../live/boss-catalog";
import { likeBurst } from "./like-burst";
import { Avatars } from "./avatars";
import type { Balance } from "./balance";
import { font } from "./font";
import { Scene } from "./scene";
import { SpriteAnim } from "./anim";
import { LASER_KINDS } from "./audio/voices";
import { drawWarped } from "./warp";
import { drawTraitor, guideRows, isDefect, isReturn, type Traitor } from "./roles";
import { DEFEATS, FATE_DUR, FATE_STAYS, drawCity, drawScreen, type Fate } from "./defeat";
import { bossOver, bossUnder, MOTION, type FxCtx } from "./bossfx";
import { BOSS_ANIM, BOSS_ART, BOSSES, NORMAL_UFOS, isMilestone, milestoneBoss, nextMilestone, PLANET_EYE, RANDOM_BOSSES, makeBossSprite, type BossDef, type BossId } from "./bosses";
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
 *             📦 rương = thùng tiếp tế rơi xuống, cả phòng được ĐẠN VÀNG · mọi tương tác nạp NĂNG LƯỢNG PHÒNG THỦ → ĐẠN VÀNG ×2
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
/** năng lượng phòng thủ mỗi tương tác nạp (quà: 1 xu = 1); tương tác miễn phí cũng đủ làm đầy */
const ENERGY = { like: 0.5, chat: 3, follow: 15, share: 15 };
const FIREWORK = ["#ffd55a", "#ff5a6e", "#5ad1ff", "#9dff7a", "#ffffff", "#ff9a3d", "#d58bff"];
const TIPS = [
  "❤️ THẢ TIM = BẮN LASER",
  "💬 BÌNH LUẬN = PHÓNG TÊN LỬA",
  "🎁 MỖI MÓN QUÀ = 1 VŨ KHÍ RIÊNG",
  "⚡ TƯƠNG TÁC NẠP NĂNG LƯỢNG = ĐẠN VÀNG ×2",
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
  /** số phận trong cảnh hạ đất (null = bị hút lên đĩa như thường) */
  fate: Fate | null;
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
  /** nhắm vào UFO đỏ của kẻ phản bội */
  traitor: Traitor | null;
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
  private scene: Scene;
  private bubbleFx = [205, 320, 40, 150].map(makeBubble);
  /** 0 vàng · 1 đỏ cam · 2 trắng xanh · 3 sao · 4 xanh lá (tia hút) · 5 tím · 6 xanh lơ */
  private glows = [makeGlow(255, 200, 90), makeGlow(255, 90, 50), makeGlow(200, 230, 255), makeStar(), makeGlow(120, 255, 160), makeGlow(200, 110, 255), makeGlow(90, 220, 255)];
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
  /** lưới tơ Nhện Vũ Trụ: chặn laser, chỉ tên lửa/quà xé được */
  private webHp = 0;
  private webMax = 0;
  private webT0 = -99;
  /** lúc rồng phun hơi thở hư không */
  private breathT = -99;
  /** Kẻ Nuốt Hành Tinh: đang hút người vào miệng hố đen */
  private devour: { t0: number; need: number; dealt: number; victims: Person[] } | null = null;
  private spitT = -99;
  /** vòng vừa rồi thua (màn nghỉ ghi câu "thả về" theo boss) */
  private lastLost = false;
  private drones: Drone[] = [];
  /** UFO đỏ của người xem "đổi phe" */
  private traitors: Traitor[] = [];
  /** tia đỏ kẻ phản bội bắn xuống thành phố (chỉ hiệu ứng) */
  private redBolts: { x0: number; y0: number; x1: number; y1: number; t0: number }[] = [];
  /** không cho đổi phe lại ngay sau khi bị bắn hạ / quay về (giây) */
  private defectCd = new Map<string, number>();
  /** máu kẻ phản bội & trùm người xem đã hồi cho trùm trong vòng (có trần) */
  private traitorHeal = 0;
  private bossHeal = 0;
  /** hàng chờ làm trùm (tặng quà lớn) và người đang điều khiển trùm vòng này */
  private bossQueue: LiveUser[] = [];
  playerBoss: LiveUser | null = null;
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
  /** năng lượng phòng thủ: mọi tương tác của cả phòng góp trong vòng */
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
  simulatedPlayers = 0;
  /** hiện chữ bình luận trên bong bóng (?bubbles=0 để tắt hẳn) */
  showChat = true;

  constructor(private bal: Balance) {
    const bg = makeBackground();
    this.bg = bg.img;
    this.towers = bg.towers;
    this.scene = new Scene(this.towers, this.glows);
    this.load();
    this.loadArts();
    for (const id of Object.keys(BOSS_ANIM) as BossId[]) this.anim(id);
  }

  get boss() {
    return this.bossDef.kind !== "normal";
  }

  private bossLabel() {
    if (this.bossDef.super) return `TRÙM SIÊU CẤP · CHUỖI ${this.bossMilestone}`;
    return this.bossDef.kind === "milestone" ? `TRÙM CHUỖI ${this.bossMilestone}` : "TRÙM NGẪU NHIÊN";
  }

  /** tỉ lệ vẽ model hiện tại */
  private get sc() {
    return this.bossDef.scale;
  }

  /** khoảng cách tâm → bụng (px màn hình) */
  private get belly() {
    return this.geo.belly;
  }

  /** ảnh art của trùm (nếu đã tải xong) */
  private arts = new Map<BossId, HTMLImageElement>();

  private loadArts() {
    for (const id of Object.keys(BOSS_ART) as BossId[]) {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => this.arts.set(id, img);
      img.src = BOSS_ART[id].url;
    }
  }

  private art(id: BossId = this.bossDef.id) {
    return this.arts.get(id) ?? null;
  }

  /** bộ chuyển động theo khung của trùm (nếu có & đã tải) */
  private anims = new Map<BossId, SpriteAnim>();
  private anim(id: BossId = this.bossDef.id) {
    let a = this.anims.get(id);
    const def = BOSS_ANIM[id];
    if (!a && def) this.anims.set(id, (a = new SpriteAnim(def.meta, def.url)));
    return a?.img ? a : null;
  }
  /** tỉ lệ vẽ bộ chuyển động: px sân khấu / px ảnh */
  private animScale(id: BossId = this.bossDef.id) {
    const def = BOSS_ANIM[id]!;
    return def.bodyW / def.meta.bodyW;
  }
  /** vận tốc ngang UFO (px/s, đã làm mượt) — chọn chuyển động idle / move */
  private uvx = 0;
  private lastUx = 0;
  /** sát thương dồn từ lần "hit" trước (đủ thì phát hoạt ảnh trúng đòn) */
  private hurtAcc = 0;
  private hurtAt = -99;
  private attackAt = 0;
  /** tia laser đỏ boss bắn trả (chỉ hiệu ứng) */
  private enemyShots: { dx: number; dy: number; x1: number; y1: number; t0: number; p: Person | null }[] = [];

  /** kiểu súng cố định của mỗi người xem (theo id) */
  private gunOf(user: LiveUser) {
    let h = 0;
    for (let i = 0; i < user.id.length; i++) h = (h * 31 + user.id.charCodeAt(i)) | 0;
    return LASER_KINDS[Math.abs(h) % LASER_KINDS.length];
  }

  /** hình học trúng đạn / bụng của model đang dùng (px sân khấu, so với tâm) */
  private get geo() {
    const def = BOSS_ANIM[this.bossDef.id];
    if (def && this.anim()) {
      const rx = def.bodyW * 0.47;
      return { rx, ry: rx * def.hitAspect, cy: def.hitCy, belly: def.meta.belly * this.animScale() };
    }
    if (this.art()) {
      const a = BOSS_ART[this.bossDef.id];
      return { rx: a.hitRx, ry: a.hitRy, cy: a.hitCy, belly: a.belly };
    }
    const d = this.bossDef;
    const s = d.scale;
    return { rx: d.hitRx * s, ry: d.hitRy * s, cy: d.hitCy * s, belly: d.bellyY * s };
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

  /** Operator command: start a fresh encounter with its entrance animation. */
  summonBoss(id: BossId) {
    if (!isBossId(id)) return;
    this.shots = [];
    this.beams = [];
    this.crates = [];
    this.enemyShots = [];
    this.breathT = -99;
    this.spitT = -99;
    this.webT0 = -99;
    this.muzzle = 0;
    this.beam = 0;
    this.devour = null;
    this.sfx.chargeStop();
    this.banners = [];
    this.floaters = [];
    for (const person of this.people) {
      person.suck = -1;
      person.fate = null;
    }
    this.forcedBoss = id;
    this.startRound();
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
    // vòng thường: đổi mẫu UFO, tránh lặp mẫu vừa gặp
    let id: BossId = pick(NORMAL_UFOS.filter((u) => u !== this.bossDef.id));
    if (this.forcedBoss) id = this.forcedBoss;
    else if (this.streak > 0 && isMilestone(this.streak)) id = milestoneBoss(this.streak);
    else if (this.round > 1 && Math.random() < this.bal.bossChance) id = pick(RANDOM_BOSSES);
    // trùm người xem: người đầu hàng chờ điều khiển trùm vòng này (lệnh gọi boss của người vận hành thì không)
    this.playerBoss = !this.forcedBoss && this.bossQueue.length ? this.bossQueue.shift()! : null;
    this.forcedBoss = null;
    const def = (this.bossDef = BOSSES[id]);
    this.bossMilestone = def.kind === "milestone" ? (isMilestone(this.streak) ? this.streak : def.milestone ?? 0) : 0;
    this.battleTime = this.bal.battleTime * def.timeMul;
    this.introDur = def.kind === "normal" ? INTRO_T : BOSS_INTRO_T;
    const viewers = this.activeCount();
    this.hpMax = Math.max(50, Math.round((this.bal.hpBase + this.bal.hpPerViewer * viewers) * this.diffMul * def.hpMul * (this.playerBoss ? 1.25 : 1)));
    // kẻ phản bội vòng trước được thả về phe Trái Đất
    for (const tr of this.traitors) this.releaseTraitor(tr, false);
    this.traitors = [];
    this.traitorHeal = 0;
    this.bossHeal = 0;
    this.grab = null;
    this.stun.clear();
    this.bolts = [];
    this.drones = [];
    this.charge = null;
    this.cloak = 0;
    this.eyeBlast = 0;
    this.abilityT = this.time + this.introDur + 7;
    this.shieldMax = def.ability === "shield" ? Math.round(this.hpMax * 0.12) : 0;
    this.webHp = 0;
    this.webMax = Math.round(this.hpMax * 0.08);
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
    this.sfx.bossIntro(this.bossDef.id);
  }

  private endRound(win: boolean) {
    if (this.phase !== "battle" && this.phase !== "intro") return;
    for (const c of this.beams) c.dur = 0;
    this.grab = null;
    this.charge = null;
    this.devour = null;
    this.sfx.chargeStop();
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
      // mỗi boss một kiểu "hạ đất": lịch số phận từng người theo hiệu ứng (quét, lan, thổi…)
      const def = DEFEATS[this.bossDef.id];
      const order = this.people
        .filter((p) => !this.isRoleUser(p.user.id))
        .map((p) => {
          const [x, y] = this.personPos(p);
          return [Math.hypot(x - CX, y - UFO_LAND_Y), p, x, y] as const;
        })
        .sort((a, b) => a[0] - b[0]);
      const spread = Math.min(0.12, 2.6 / Math.max(1, order.length));
      order.forEach(([, p, x, y], i) => {
        p.fate = def.fate === "abduct" ? null : def.fate;
        let at = 0.9 + i * spread;
        if (def.fate === "pixel") at = 0.8 + clamp((y - 900) / 700, 0, 1) * 1.6;
        else if (def.fate === "blown") at = 1.2 + clamp(x / W, 0, 1) * 1.2;
        else if (def.fate === "crystal") at = 0.6 + Math.abs(x - CX) / 500;
        else if (def.fate === "fall") at = 1 + Math.random() * 0.4;
        else if (def.fate === "gold" || def.fate === "swept" || def.fate === "fling") at = 0.7 + Math.random() * 2.3;
        else if (def.fate === "vanish") at = 0.8 + Math.random() * 3;
        else if (def.fate === "carried") at = 0.6 + i * 0.15;
        else if (def.fate === "swallow") at = 0.8 + i * spread * 1.3;
        p.suck = this.time + at;
      });
      this.abducted = order.length;
      this.sfx.lose();
      this.sfx.defeat(this.bossDef.id);
    }
    this.lastLost = !win;
    this.save();
  }

  // ================= sự kiện live =================

  handle(e: LiveEvent) {
    if (e.type === "summonBoss") {
      this.summonBoss(e.bossId);
      return;
    }
    if (e.type === "control") {
      this.simulatedPlayers = e.settings.simulatedPlayers;
      this.sfx.muted = e.settings.muted;
      this.sfx.musicOn = e.settings.music;
      return;
    }
    if (e.type === "remove") {
      const ids = new Set(e.ids);
      this.people = this.people.filter(p => !ids.has(p.user.id));
      this.shots = this.shots.filter(s => !ids.has(s.user.id));
      for (const id of ids) this.active.delete(id);
      if (this.grab && ids.has(this.grab.p.user.id)) this.grab = null;
      return;
    }
    if (e.type === "status") {
      if (e.state === "offline") {
        this.people = [];
        this.active.clear();
        this.grab = null;
      }
      this.status = e.state === "connected" || e.state === "idle" ? "" : `${e.state}${e.detail ? ": " + e.detail : ""}`;
      return;
    }
    // mọi chữ của người xem đi qua bộ lọc trước khi lên màn hình (tên tục / số điện thoại / link → "Người xem #xxxx")
    const user: LiveUser = { ...e.user, name: cleanName(e.user.name, e.user.id) };
    this.active.set(user.id, this.time);
    const person = this.ensurePerson(user);
    person.seen = this.time;
    if (e.type === "presence") return;
    person.pulse = 1;
    const fighting = this.phase === "battle" && this.ufoAlive && this.hp > 0;
    if (this.handleRoles(e, user, person, fighting)) return;

    switch (e.type) {
      case "join":
        break;
      case "like": {
        if (fighting) {
          for (const shot of likeBurst(e.count, this.bal.likeDmg)) this.fire("laser", user, shot.damage, shot.delay);
          this.sparks(...this.originFor(user), 4, 160);
        }
        else this.sparks(...this.personPos(person), 3, 160);
        this.addFund(user, Math.max(1, e.count) * ENERGY.like);
        break;
      }
      case "chat": {
        // bình luận vi phạm: vẫn tính là bắn (người xem có tương tác) nhưng không hiện chữ
        const text = this.showChat ? cleanChat(e.text) : "";
        if (text) {
          person.say = [...text].slice(0, 22).join("") + (text.length > 22 ? "…" : "");
          person.sayT = this.time;
        }
        const cd = this.chatCd.get(user.id) ?? -99;
        if (this.time - cd < this.bal.chatCooldown) break;
        this.chatCd.set(user.id, this.time);
        if (fighting) this.fire("rocket", user, this.bal.chatDmg);
        this.addFund(user, ENERGY.chat);
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
        this.addFund(user, ENERGY.follow);
        break;
      case "share":
        this.pushBack(user, this.bal.sharePush, "gọi viện binh");
        this.addFund(user, ENERGY.share);
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
      if (total >= 10) this.toast(`Cảm ơn ${user.name}!`, label, "#ffd55a", user, 1);
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
        this.sfx.beam("twin", 1.8, px);
        break;
      case "cannon":
        this.beams.push({ style: "earth", user, x: px, y: GROUND_Y + 60, t0: this.time, dur: 2.6, dmg, dealt: 0 });
        this.shake = Math.max(this.shake, 18);
        this.sfx.beam("earth", 2.6, px);
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
        this.sfx.beam("orbital", 3.2, this.ux);
        break;
      }
    }
    this.giftCtx = false;
    this.sfx.coin(px);
    // quà nhỏ: combo "🌹 ×12" trên bong bóng là đủ; quà từ 10 xu có băng rôn
    if (total >= 10) {
      const prio = g.weapon === "orbital" ? 4 : g.weapon === "cannon" ? 3 : total >= 100 ? 2 : 1;
      const color = g.weapon === "orbital" ? "#9fd8ff" : g.weapon === "cannon" ? "#ff5a6e" : "#ffd55a";
      this.toast(`${user.name}: ${label}`, WEAPON_LABEL[g.weapon], color, user, prio);
    }
    this.addFund(user, total);
  }

  /**
   * Năng lượng phòng thủ: MỌI tương tác đều nạp (tim, bình luận, follow, chia sẻ, quà) → đầy thì ĐẠN VÀNG ×2 cho cả phòng,
   * mốc sau cao hơn. Màn hình chỉ hiện %, không hiện số xu (tránh biến thành bảng "mục tiêu xu" kêu gọi tặng quà).
   */
  private addFund(user: LiveUser, energy: number) {
    if (this.phase !== "battle" || energy <= 0) return;
    this.fund += energy;
    let filled = 0;
    while (this.fund >= this.fundGoal) {
      this.fund -= this.fundGoal;
      this.fundGoal = Math.round((this.fundGoal * 1.6) / 10) * 10;
      filled++;
    }
    if (filled) this.activateGold(this.bal.goldTime * filled, `Năng lượng đầy nhờ ${user.name} · tim & chat ×2`, user);
  }

  private activateGold(sec: number, sub: string, user?: LiveUser) {
    // cộng dồn nhưng tối đa 30 giây còn lại (quà khủng làm đầy quỹ nhiều lần cũng không kéo dài mãi)
    this.goldUntil = Math.min(this.time + 30, Math.max(this.goldUntil, this.time) + sec);
    for (const p of this.people) p.pulse = 1;
    this.toast("⚡ ĐẠN VÀNG ×2 KÍCH HOẠT!", sub, "#ffd55a", user, 3);
    this.sfx.golden();
  }

  /** Rương xu: thùng tiếp tế treo dù rơi xuống thành phố */
  private dropCrate(user: LiveUser, coins: number) {
    if (this.crates.length > 4) return;
    const cx = rand(240, 840);
    this.crates.push({ user, coins, x: cx, t0: this.time, openT: -1 });
    this.sfx.crateDrop(cx);
    this.toast(`📦 ${user.name} thả Rương!`, "Thùng tiếp tế đang rơi xuống thành phố", "#ffd55a", user, 2);
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
    this.sfx.crateOpen(x);
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
      hit.user = { ...user, avatar: user.avatar || hit.user.avatar };
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
      x0: Math.random() * W,
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
      fate: null,
    };
    this.people.push(p);
    this.people.sort((a, b) => a.z - b.z);
    this.sparks(...this.personPos(p), 6, 220);
    return p;
  }

  private visible = { left: 0, top: 0, right: W, bottom: H };

  setVisibleBounds(left: number, top: number, right: number, bottom: number) {
    this.visible = { left, top, right, bottom };
  }

  private personPos(p: Person): [number, number] {
    // Leave room for the bubble's pulse, name and camera shake at the edges.
    const margin = BUBBLE_R * p.z * 1.5 + 24;
    const left = Math.min(this.visible.left + margin, (this.visible.left + this.visible.right) / 2);
    const right = Math.max(left, this.visible.right - margin);
    const span = right - left;
    const travel = span > 0 ? ((p.x0 + p.v * this.time) % (2 * span) + 2 * span) % (2 * span) : 0;
    const x = left + (travel <= span ? travel : 2 * span - travel);
    const top = Math.min(this.visible.top + margin, (this.visible.top + this.visible.bottom) / 2);
    const bottom = Math.max(top, this.visible.bottom - margin - 24);
    const y = clamp(Math.min(PEOPLE_Y1 + 40, p.y0 + Math.sin(this.time * 0.8 + p.p) * 10), top, bottom);
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
      this.damage(user, dmg, this.ux + rand(-120, 120), this.uy, false, !this.giftCtx, true);
      return;
    }
    const [sx, sy] = this.originFor(from ?? user);
    const hue = this.avatars.hue(user);
    this.shots.push({
      kind,
      user,
      sx,
      sy,
      ox: rand(-0.7, 0.7) * this.geo.rx,
      oy: this.geo.cy + rand(-0.5, 0.6) * this.geo.ry,
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
      traitor: null,
    });
    // cả phòng ưu tiên bắn kẻ phản bội: ~60% đạn (trừ siêu tên lửa) đổi hướng sang UFO đỏ
    const shot = this.shots[this.shots.length - 1];
    const alive = this.traitors.filter((t) => !t.dead && t.user.id !== user.id);
    if (!shot.drone && alive.length && kind !== "mega" && Math.random() < 0.6) {
      const [ox, oy] = [sx, sy];
      shot.traitor = alive.reduce((a, b) => (Math.hypot(a.x - ox, a.y - oy) < Math.hypot(b.x - ox, b.y - oy) ? a : b));
      shot.ox = rand(-30, 30);
      shot.oy = rand(-10, 20);
    }
    if (kind === "laser") this.sfx.laser(sx, this.gunOf(user), this.golden && !this.giftCtx);
    else if (fx === "rose" || (kind === "rocket" && !this.giftCtx)) this.sfx.whistle(sx, fx === "rose" ? 1 : 0.7);
    else if (fx === "confetti") {
      this.sfx.popper(sx);
      this.sfx.launch(1.6, sx);
    }
    else if (kind === "heart") this.sfx.heart(sx);
    else if (kind === "bill") this.sfx.bill(sx);
    else this.sfx.launch(kind === "mega" ? 2.2 : kind === "heavy" ? 1.6 : 1, sx);
  }

  private damage(user: LiveUser, dmg: number, x: number, y: number, big: boolean, boost = false, laser = false) {
    if (this.phase !== "battle" || this.hp <= 0) return;
    if (boost && this.golden) dmg *= 2;
    // bị bắn choáng (kỹ năng "counter" — hiện chưa boss nào dùng): sát thương giảm một nửa
    if ((this.stun.get(user.id) ?? 0) > this.time) dmg *= 0.5;
    // Tàu Tàng Hình đang biến mất: phần lớn đạn trượt
    if (this.cloaked) {
      dmg *= 0.3;
      if (Math.random() < 0.15) this.floatText("TRƯỢT", x, y - 30, "#7fd8ff", 24);
    }
    if (this.grab) this.grab.dealt += dmg;
    if (this.devour) this.devour.dealt += dmg;
    if (this.charge) this.charge.dealt += dmg;
    // Nhện Vũ Trụ: laser dính lưới (30%), tên lửa & quà xé lưới trước
    if (this.webHp > 0) {
      if (laser) {
        dmg *= 0.3;
        if (Math.random() < 0.06) this.floatText("DÍNH TƠ", x, y - 30, "#b8ff9a", 22);
      } else {
        const a = Math.min(this.webHp, dmg);
        this.webHp -= a;
        dmg -= a;
        if (this.webHp <= 0) {
          this.webHp = 0;
          this.abilityT = this.time + 12;
          this.toast("🕸 XÉ RÁCH LƯỚI TƠ!", `${user.name} mở đường cho cả phòng`, "#7dff4a", user, 3);
          this.sfx.webTear();
          this.sparks(this.ux, this.uy + this.belly * 0.4, 40, 800);
        }
        if (dmg <= 0) return;
      }
    }
    // Pháo Đài Tinh Thể: khiên hứng sát thương trước
    if (this.shieldHp > 0) {
      const a = Math.min(this.shieldHp, dmg);
      this.shieldHp -= a;
      dmg -= a;
      if (this.shieldHp <= 0) {
        this.shieldHp = 0;
        this.abilityT = this.time + 12;
        this.toast("💥 PHÁ KHIÊN TINH THỂ!", `${user.name} ra đòn quyết định`, "#7ff0ff", user, 3);
        this.sfx.shatter();
        this.sparks(this.ux, this.uy, 60, 900);
        for (let i = 0; i < 3; i++) this.firework(this.ux + rand(-150, 150), this.uy + rand(-150, 150), "#7ff0ff", 40);
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
    this.hurtAcc += d;
    if ((big || this.hurtAcc > this.hpMax * 0.05) && this.time - this.hurtAt > 1.4) {
      this.hurtAt = this.time;
      this.hurtAcc = 0;
      const an = this.anim();
      if (an && an.playing(this.time) !== "attack") an.play("hit", this.time);
      this.sfx.bossHurt(this.bossDef.id, x);
    }
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
            const stay = p.fate && FATE_STAYS[p.fate];
            if (stay) this.sparks(...this.personPos(p), 14, 400);
            p.suck = -1;
            p.fate = null;
            p.born = stay ? this.time - 1 : this.time + Math.random() * 0.8;
          }
        }
        this.ufoAlive = false;
        if (this.phaseT >= BREAK_T) this.startRound();
        break;
    }

    this.hpShown = approach(this.hpShown, this.hp, this.phase === "intro" ? 2.2 : 14, dtReal);
    this.hpTrail = this.hpTrail < this.hpShown ? this.hpShown : approach(this.hpTrail, this.hpShown, 2.4, dtReal);
    this.beam = approach(this.beam, this.beamWant, 6, dt);

    this.uvx = approach(this.uvx, (this.ux - this.lastUx) / Math.max(dt, 1e-3), 6, dt);
    this.lastUx = this.ux;
    this.updateShots(dt);
    this.updateFx(dt);
    this.enemyShots = this.enemyShots.filter((e) => this.time - e.t0 < 0.5);
    this.updateTraitors(dt);
    this.sfx.update({ phase: this.phase, progress: this.progress, boss: this.bossDef.id, bossKind: this.bossDef.kind, ufoAlive: this.ufoAlive, golden: this.golden });
    this.scene.update(dt);
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
    this.updateCounter();
    const sway = 260 * (1 - this.progress * 0.45);
    const tx = CX + sway * Math.sin(this.time * 0.55) + 50 * Math.sin(this.time * 1.7);
    const ty = lerp(UFO_START_Y, UFO_LAND_Y, this.progress) + Math.sin(this.time * 1.3) * 10 - this.kick;
    // trùm to (Phi Thuyền Mẹ…) lượn hẹp lại để không tràn khỏi màn hình
    const half = Math.max(this.geo.rx + 20, this.art() ? BOSS_ART[this.bossDef.id].width / 2 + 8 : 0);
    this.moveUfo(clamp(tx, Math.min(CX, half), Math.max(CX, W - half)), ty, 3, dt);
    // gần đất: tia hút chập chờn doạ người xem
    if (this.progress > 0.55) {
      const f = Math.sin(this.time * 0.9) + Math.sin(this.time * 2.3);
      this.beamWant = f > 1.1 ? 0.35 + (this.progress - 0.55) : 0;
    } else this.beamWant = 0;
    if (this.progress > 0.75 && this.time - this.alarmAt > 4) {
      this.alarmAt = this.time;
      this.sfx.siren();
    }
    // UFO hư hại → bốc khói, cháy
    const hpk = this.hp / this.hpMax;
    if (hpk < 0.6 && Math.random() < dt * (hpk < 0.3 ? 30 : 12)) {
      this.smoke.push({ x: this.ux + rand(-0.5, 0.5) * this.geo.rx, y: this.uy + rand(-20, 10), vx: rand(-20, 20), vy: rand(-90, -40), life: 0, max: rand(1.2, 2), size: rand(14, 26) });
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
        const x = this.ux + rand(-0.75, 0.75) * this.geo.rx;
        const y = this.uy + this.geo.cy + rand(-0.6, 0.6) * this.geo.ry;
        this.blasts.push({ x, y, t: this.time, color: pick(FIREWORK), size: rand(60, 110) });
        this.sparks(x, y, 8, 500);
        this.sfx.hit(false, x);
        const an = this.anim();
        if (an && !an.playing(this.time)) an.play("hit", this.time);
      }
      this.timeScale = t < 0.5 ? 0.3 : approach(this.timeScale, 1, 4, dt);
    } else this.timeScale = 1;
    if (this.at("boom", 1.5)) {
      this.ufoAlive = false;
      this.flash = 1;
      this.shake = 30;
      this.sfx.boom();
      this.sfx.bossDeath(this.bossDef.id);
      const big = clamp((this.geo.rx) / 230, 1, 2.2);
      this.blasts.push({ x: this.ux, y: this.uy, t: this.time, color: "#ffffff", size: 420 * big });
      if (this.boss) for (let i = 0; i < 4; i++) this.firework(this.ux + rand(-200, 200), this.uy + rand(-120, 120), this.bossDef.color, 70);
      for (let i = 0; i < 3; i++) this.firework(this.ux + rand(-60, 60), this.uy + rand(-30, 30), FIREWORK[i], 90);
      this.sparks(this.ux, this.uy, 120, 1300);
      for (let i = 0; i < 46; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(200, 900);
        this.debris.push({ x: this.ux + rand(-0.5, 0.5) * this.geo.rx, y: this.uy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 300, rot: rand(0, 6), vr: rand(-12, 12), w: rand(8, 34), h: rand(4, 14), life: rand(2, 3.5) });
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
    const def = DEFEATS[this.bossDef.id];
    if (def.exit !== "flyup") {
      // ở lại thống trị thành phố tới hết cảnh
      const ty = def.exit === "perch" ? UFO_LAND_Y + 40 : UFO_LAND_Y - 40;
      this.moveUfo(CX, ty + Math.sin(this.time * 1.4) * 6, 2.5, dt);
      this.beamWant = 0;
      if (def.exit === "vanish") this.cloak = approach(this.cloak, t > 0.6 ? 1 : 0, 3, dt);
      if (this.at("quake", def.city === "cracks" ? 1.1 : def.city === "lava" ? 0.6 : def.city === "blackout" ? 0.5 : 99)) {
        this.shake = 30;
        this.flash = def.city === "blackout" ? 0.7 : 0.4;
      }
    } else if (t < 5.6) {
      this.moveUfo(CX, UFO_LAND_Y - 40 + Math.sin(this.time * 1.4) * 6, 2.5, dt);
      this.beamWant = def.beam ? (t > 0.5 ? 1 : 0.4) : 0;
      if (this.at("quake", def.city === "blackout" ? 0.5 : 99)) this.flash = 0.7;
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
    if (s.traitor) return [s.traitor.x + s.ox, s.traitor.y + s.oy];
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
        if (s.traitor) {
          // UFO đỏ đã nổ trước khi đạn tới → đạn bay tiếp vào trùm
          if (!s.traitor.dead) {
            this.hitTraitor(s.traitor, s.dmg, s.user, s.boost);
            this.sparks(x, y, s.kind === "laser" ? 3 : 10, 360);
            continue;
          }
        }
        const big = s.kind === "heavy" || s.kind === "mega";
        this.sfx.impact(this.bossDef.id, s.kind === "laser" || s.kind === "heart" || s.kind === "bill" ? "laser" : big ? "heavy" : "rocket", x);
        if (s.kind === "laser") this.sparks(x, y, 2, 240);
        else if (s.kind === "heart" || s.kind === "bill") this.sparks(x, y, 4, 320);
        else {
          if (s.fx === "rose") this.firework(x, y, "#ff5a8a", 24);
          if (s.fx === "confetti") {
            for (let i = 0; i < 70; i++) this.confetti.push({ x, y, vx: rand(-600, 600), vy: rand(-700, 100), rot: rand(0, 6), vr: rand(-12, 12), color: pick(CONFETTI), life: rand(1.5, 2.6) });
          }
          this.blasts.push({ x, y, t: this.time, color: s.color, size: big ? 200 : 90 });
          for (let i = 0; i < (big ? 6 : 2); i++) this.smoke.push({ x: x + rand(-20, 20), y: y + rand(-14, 14), vx: rand(-30, 30), vy: rand(-50, -10), life: 0, max: rand(0.9, 1.6), size: rand(12, big ? 34 : 20) });
          this.sparks(x, y, big ? 30 : 8, big ? 800 : 420);
          if (big) this.firework(x, y, s.color, 40);
          this.sfx.hit(big, x);
        }
        this.damage(s.user, s.dmg, x, y, big, s.boost, s.kind === "laser" || s.kind === "heart" || s.kind === "bill");
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
    this.sfx.firework(x);
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
    const lose = this.phase === "lose" ? DEFEATS[this.bossDef.id] : null;
    const env = this.defeatEnv();
    if (lose?.city === "tilt") {
      // hố đen nuốt cả phố: thế giới nghiêng & co dần về phía miệng
      const k = clamp((this.phaseT - 0.5) / 4.5, 0, 1);
      // góc lộ ra khi thế giới co & xoay là khoảng không vũ trụ tối, không để lộ nền canvas
      ctx.fillStyle = "#04030a";
      ctx.fillRect(-60, -60, W + 120, H + 120);
      ctx.translate(env.mx, env.my);
      ctx.rotate(0.22 * k * k);
      ctx.scale(1 - 0.18 * k, 1 - 0.18 * k);
      ctx.translate(-env.mx, -env.my);
    }
    ctx.drawImage(this.bg, 0, 0);
    this.drawTowerLights(ctx);
    this.scene.drawBack(ctx);
    if (lose) drawCity(ctx, lose.city, env);

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
    if (this.ufoAlive && this.playerBoss) this.drawPlayerBoss(ctx);
    this.drawTraitors(ctx);
    this.drawAbilities(ctx);
    this.drawEnemyShots(ctx);
    this.drawWeb(ctx);
    this.drawBreath(ctx);
    this.drawVortex(ctx);
    this.drawBeams(ctx);
    this.drawCrates(ctx);
    this.drawShots(ctx, true);
    this.drawFx(ctx);
    this.scene.drawFront(ctx);
    ctx.restore();

    if (lose) drawScreen(ctx, lose.city, env);
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
    // người đang là UFO đỏ / đang điều khiển trùm không đứng dưới phố
    if (p.suck < 0 && (this.playerBoss?.id === p.user.id || this.traitors.some((t) => !t.dead && t.user.id === p.user.id))) return;
    let [x, y] = this.personPos(p);
    let r = BUBBLE_R * p.z;
    let rot = 0;
    let glow = p.pulse * 0.7;
    let fateU = -1;
    let alpha = 1;
    if (p.suck >= 0 && p.fate) {
      const pose = this.fatePose(p, x, y, r);
      if (!pose) return;
      ({ x, y, r, rot, alpha, u: fateU } = pose);
      glow = pose.glow;
    } else if (p.suck >= 0) {
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
    } else if (this.devour?.victims.includes(p)) {
      // bị hút xoáy dần về miệng hố đen (chưa tới hẳn — còn cứu được)
      const u = clamp((this.time - this.devour.t0) / 5, 0, 1);
      const [mx, my] = this.mawPos();
      const e = u * u * 0.7;
      const ang = this.time * 4 + p.p;
      x = lerp(x, mx, e) + Math.cos(ang) * 40 * (1 - e) * u;
      y = lerp(y, my, e) + Math.sin(ang) * 20 * (1 - e) * u;
      r *= 1 - 0.4 * e;
      rot = this.time * 3 * u;
      glow = 0.6;
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
    const cx = (this.visible.left + this.visible.right) / 2;
    const cy = (this.visible.top + this.visible.bottom) / 2;
    x = clamp(x, Math.min(cx, this.visible.left + r + 24), Math.max(cx, this.visible.right - r - 24));
    y = clamp(y, Math.min(cy, this.visible.top + r + 24), Math.max(cy, this.visible.bottom - r - 40));

    if (p.fate === "cocoon" && fateU >= 0) {
      // sợi tơ treo kén
      ctx.strokeStyle = "rgba(230,255,220,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + Math.sin(this.time) * 10, y - r - 420);
      ctx.stroke();
    }
    if (p.fate === "carried" && fateU >= 0) this.drawCarrier(ctx, x, y, r, fateU);
    if (glow > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = glow * alpha;
      ctx.drawImage(this.glows[p.suck >= 0 ? 4 : 2], x - r * 2, y - r * 2, r * 4, r * 4);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = alpha;
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
    if (p.fate && fateU >= 0) this.drawFateOverlay(ctx, p.fate, fateU, r);
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
    if (this.art()) return [this.ux, this.uy];
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
            this.sfx.grab(this.personPos(p)[0]);
            // bộ chuyển động: nheo mắt giận → gom năng lượng → phóng chưởng
            this.anim()?.play("attack", now);
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
        // kỹ năng "counter" (để dành cho boss sau): bắn 3 quả cầu điện vào bong bóng người xem → choáng 5 giây
        if (now >= this.abilityT) {
          this.abilityT = now + 8;
          const cand = this.freePeople();
          for (let i = 0; i < 3 && cand.length; i++) {
            const p = cand.splice((Math.random() * cand.length) | 0, 1)[0];
            this.bolts.push({ p, t0: now + i * 0.18, x0: this.ux + rand(-0.6, 0.6) * this.geo.rx, y0: this.uy - 30 });
          }
          this.muzzle = 1;
          for (const b of this.bolts) this.sfx.zap(b.x0);
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
      case "web":
        if (this.webHp <= 0 && now >= this.abilityT) {
          this.webHp = this.webMax;
          this.webT0 = now;
          this.sfx.webUp();
          this.toast("🕸 NHỆN GIĂNG LƯỚI TƠ!", "Tim chỉ 30% · bình luận để xé lưới", "#7dff4a", undefined, 2);
        }
        break;
      case "shield":
        // Pháo Đài Tinh Thể: khiên vỡ 12 giây sau thì tự hồi
        if (this.shieldHp <= 0 && now >= this.abilityT) {
          this.shieldHp = this.shieldMax;
          this.sfx.shieldUp();
          this.toast("🛡 KHIÊN TINH THỂ HỒI PHỤC!", `Phá ${fmt(this.shieldMax)} khiên rồi mới đánh vào thân`, d.color, undefined, 2);
        }
        break;
      case "drones": {
        // Phi Thuyền Mẹ: cứ 7 giây thả 2 UFO con (tối đa 6), chạm phố là bắt 1 người
        if (now >= this.abilityT) {
          this.abilityT = now + 7;
          const alive = this.drones.filter((x) => !x.dead).length;
          for (let i = 0; i < Math.min(2, 6 - alive); i++) {
            const x0 = this.ux + rand(-0.5, 0.5) * this.geo.rx;
            const y0 = this.uy + this.belly;
            const max = Math.max(20, Math.round(this.hpMax * 0.02));
            this.drones.push({ x: x0, y: y0, x0, y0, tx: rand(120, W - 120), t0: now + i * 0.5, hp: max, max, dead: false });
          }
          if (alive < 6) this.sfx.droneDrop();
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
          this.sfx.chargeStart();
        }
        const c = this.charge;
        if (c) {
          if (c.dealt >= c.need) {
            this.charge = null;
            this.abilityT = now + 12;
            this.toast("✅ NGẮT SẠC THÀNH CÔNG!", "Mắt hủy diệt bị choáng", "#9dff7a", undefined, 3);
            this.sparks(...this.eyePos(), 50, 800);
            this.sfx.chargeStop();
            this.sfx.golden();
          } else if (now - c.t0 >= 5) {
            this.charge = null;
            this.abilityT = now + 12;
            this.eyeBlast = 1;
            this.progress = Math.min(1, this.progress + 0.08);
            this.shake = 34;
            this.flash = 0.45;
            this.sfx.chargeStop();
            this.sfx.boom();
            this.toast("💥 PHÁO HỦY DIỆT KHAI HỎA!", "UFO bị đẩy sát mặt đất thêm 8 km", d.color, undefined, 3);
          }
        }
        break;
      }
      case "devour": {
        // Kẻ Nuốt Hành Tinh: há miệng hố đen hút 3 người trong 5s; đủ sát thương thì nghẹn nhả ra, không thì nuốt & hồi máu
        if (!this.devour && now >= this.abilityT) {
          const cand = this.freePeople().filter((p) => {
            const [x] = this.personPos(p);
            return x > 60 && x < W - 60;
          });
          if (cand.length) {
            const victims = cand.sort(() => Math.random() - 0.5).slice(0, 3);
            const need = Math.round(this.hpMax * 0.06);
            this.devour = { t0: now, need, dealt: 0, victims };
            this.toast("🌀 MIỆNG HỐ ĐEN MỞ!", `Hút ${victims.map((v) => short(v.user.name, 8)).join(", ")} · dồn ${fmt(need)} trong 5s`, d.color, victims[0].user, 3);
            this.sfx.suckStart();
          } else this.abilityT = now + 3;
        }
        const dv = this.devour;
        if (dv) {
          if (dv.dealt >= dv.need) {
            this.devour = null;
            this.abilityT = now + 13;
            this.spitT = now;
            for (const p of dv.victims) {
              p.pulse = 1;
              this.sparks(...this.personPos(p), 14, 500);
            }
            this.sfx.chargeStop();
            this.sfx.bossHurt(d.id, this.ux);
            this.toast("🤢 QUÁI BỊ NGHẸN, NHẢ NGƯỜI RA!", "Cả phòng cứu được mọi người", "#9dff7a", undefined, 3);
          } else if (now - dv.t0 >= 5) {
            this.devour = null;
            this.abilityT = now + 13;
            for (const p of dv.victims) p.suck = now;
            const heal = Math.round(this.hpMax * 0.05);
            this.hp = Math.min(this.hpMax, this.hp + heal);
            this.sfx.chargeStop();
            this.sfx.gulp();
            this.toast(`😱 NUỐT MẤT ${dv.victims.length} NGƯỜI!`, `Kẻ Nuốt Hành Tinh hồi ${fmt(heal)} máu`, "#ff5a6e", undefined, 3);
            this.floatText(`+${fmt(heal)}`, this.ux, this.uy - 120, "#9dff7a", 46);
          }
        }
        break;
      }
      case "breath": {
        // Rồng Không Gian: hít sâu 4 giây; đủ sát thương thì ngắt, không thì phun hơi thở hư không quét cả phố
        if (!this.charge && now >= this.abilityT) {
          const need = Math.round(this.hpMax * 0.06);
          this.charge = { t0: now, need, dealt: 0 };
          this.toast("🐉 RỒNG ĐANG HÍT SÂU!", `Dồn ${fmt(need)} sát thương trong 4s để ngắt`, d.color, undefined, 3);
          this.sfx.roar(false);
        }
        const c = this.charge;
        if (c) {
          if (c.dealt >= c.need) {
            this.charge = null;
            this.abilityT = now + 14;
            this.toast("✅ RỒNG BỊ NGẮT HƠI!", "Cả phòng chặn được hơi thở hư không", "#9dff7a", undefined, 3);
            this.sparks(...this.mouthPos(), 50, 800);
            this.sfx.golden();
          } else if (now - c.t0 >= 4) {
            this.charge = null;
            this.abilityT = now + 14;
            this.breathT = now;
            this.progress = Math.min(1, this.progress + 0.06);
            for (const p of this.freePeople()) this.stun.set(p.user.id, now + 6);
            this.shake = 30;
            this.flash = 0.35;
            this.sfx.breath();
            this.toast("🌌 HƠI THỞ HƯ KHÔNG!", "Cả phòng bị choáng 6s · UFO tụt 6 km", d.color, undefined, 3);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private defeatEnv() {
    const [mx, my] = this.bossDef.id === "devourer" ? this.mawPos() : [this.ux, this.uy];
    return { t: this.phaseT, time: this.time, ux: this.ux, uy: this.uy, glows: this.glows, mx, my };
  }

  /** vị trí / cỡ / độ trong của 1 người theo số phận trong cảnh hạ đất (null = đã biến khỏi màn) */
  private fatePose(p: Person, x: number, y: number, r: number) {
    const f = p.fate!;
    const raw = this.time - p.suck;
    const u = clamp(raw / FATE_DUR[f], 0, 1);
    let rot = 0;
    let alpha = 1;
    let glow = 0;
    if (raw < 0) return { x, y, r, rot, alpha, glow, u: -1 };
    const e = u * u * (3 - 2 * u);
    const side = x < CX ? -1 : 1;
    switch (f) {
      case "pixel":
        if (u >= 1) return null;
        y -= u * 90;
        alpha = 1 - u;
        glow = 0.8 * (1 - u);
        break;
      case "fall":
        if (u >= 1) return null;
        if (u < 0.35) x += Math.sin(this.time * 80 + p.p) * 3;
        else {
          const d = ((u - 0.35) / 0.65) ** 2;
          y += d * 520;
          rot = d * 1.4 * side;
        }
        alpha = 1 - clamp((u - 0.8) / 0.2, 0, 1);
        break;
      case "gold":
      case "crystal":
        rot = 0;
        break;
      case "swept":
        if (u >= 1) return null;
        x += side * u * u * 900;
        y -= Math.sin(u * Math.PI) * 160;
        rot = side * u * 7;
        break;
      case "vanish":
        if (u >= 1) return null;
        alpha = u < 0.7 ? (Math.sin(this.time * 70 + p.p * 9) > 0 ? 1 : 0.15) : 1 - (u - 0.7) / 0.3;
        x += (Math.random() - 0.5) * 10 * u;
        break;
      case "cocoon":
        y -= e * 70;
        rot = u >= 1 ? Math.sin(this.time * 2 + p.p) * 0.18 : 0;
        x += u >= 1 ? Math.sin(this.time * 2 + p.p) * 8 : 0;
        break;
      case "swallow": {
        if (u >= 1) return null;
        const [mx, my] = this.mawPos();
        const ang = p.p + u * Math.PI * 4;
        const sw = (1 - e) * 90;
        x = x + (mx - x) * e + Math.cos(ang) * sw;
        y = y + (my - y) * e + Math.sin(ang) * sw * 0.6;
        r *= 1 - 0.9 * e;
        rot = u * 8;
        glow = 0.5;
        break;
      }
      case "carried":
        if (u > 0.35) y -= ((u - 0.35) / 0.65) ** 2 * 1700;
        if (u >= 1 || y < -150) return null;
        glow = u > 0.3 ? 0.4 : 0;
        break;
      case "fling":
        if (u >= 1) return null;
        x += side * u * 320;
        y += -1000 * u + 1300 * u * u;
        rot = side * u * 11;
        alpha = 1 - clamp((u - 0.85) / 0.15, 0, 1);
        glow = 0.6;
        break;
      case "blown":
        if (u >= 1) return null;
        x += u * u * 1150;
        y -= u * 260;
        rot = u * 10;
        alpha = 1 - u ** 3;
        glow = 0.5;
        break;
      default:
        break;
    }
    return { x, y, r, rot, alpha, glow, u };
  }

  /** lớp phủ lên bong bóng theo số phận (vẽ trong toạ độ bong bóng, tâm 0,0) */
  private drawFateOverlay(ctx: CanvasRenderingContext2D, f: Fate, u: number, r: number) {
    switch (f) {
      case "gold": {
        // tượng vàng: phủ vàng kim loại + lấp lánh
        const k = clamp(u * 1.4, 0, 1);
        const g = ctx.createLinearGradient(-r, -r, r, r);
        g.addColorStop(0, `rgba(255,240,170,${0.9 * k})`);
        g.addColorStop(0.5, `rgba(230,170,40,${0.85 * k})`);
        g.addColorStop(1, `rgba(140,90,10,${0.9 * k})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
        ctx.fill();
        if (k >= 1) {
          ctx.globalCompositeOperation = "lighter";
          const a = (this.time * 1.5 + r) % 3;
          if (a < 1) ctx.drawImage(this.glows[3], -r * 0.7 + a * r, -r * 0.6, r * 0.8, r * 0.8);
          ctx.globalCompositeOperation = "source-over";
        }
        return;
      }
      case "crystal": {
        // khối pha lê lục giác bọc quanh
        const k = clamp(u * 1.3, 0, 1);
        const R = r * (1 + 0.35 * k);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          const x = Math.cos(a) * R;
          const y = Math.sin(a) * R * 1.15;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(140,230,255,${0.45 * k})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(230,255,255,${0.9 * k})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${0.35 * k})`;
        ctx.beginPath();
        ctx.moveTo(-R * 0.5, -R * 0.9);
        ctx.lineTo(-R * 0.1, -R * 0.9);
        ctx.lineTo(-R * 0.6, R * 0.4);
        ctx.closePath();
        ctx.fill();
        return;
      }
      case "cocoon": {
        // kén tơ trắng quấn dần từ dưới lên
        const k = clamp(u * 1.2, 0, 1);
        ctx.fillStyle = `rgba(235,240,230,${0.9 * k})`;
        ctx.beginPath();
        ctx.ellipse(0, r * 0.1, r * 1.05, r * 1.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(150,170,140,${0.8 * k})`;
        ctx.lineWidth = 2;
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          ctx.ellipse(0, i * r * 0.3, r * 1.05 * Math.sqrt(1 - (i / 4.2) ** 2), r * 0.12, 0.15, 0, Math.PI * 2);
          ctx.stroke();
        }
        return;
      }
      case "fall": {
        // bất tỉnh: xám đi, có tia điện xẹt
        ctx.fillStyle = "rgba(30,34,44,0.6)";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
        ctx.fill();
        if (u < 0.4 && Math.random() < 0.5) text(ctx, "⚡", 0, 0, r * 0.8, "#7ff0ff", "center", 400);
        return;
      }
      case "pixel": {
        // tan thành điểm ảnh xanh bay lên
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 14; i++) {
          const a = i * 2.4;
          const d = u * r * (1.2 + (i % 4) * 0.4);
          ctx.fillStyle = `rgba(120,230,255,${1 - u})`;
          ctx.fillRect(Math.cos(a) * d - 4, Math.sin(a) * d - u * 60 - 4, 8, 8);
        }
        ctx.globalCompositeOperation = "source-over";
        return;
      }
      default:
        return;
    }
  }

  /** UFO con hạ xuống tóm người rồi chở bay lên (cảnh chiếm đóng của Phi Thuyền Mẹ) */
  private drawCarrier(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, u: number) {
    const img = this.art("ufo");
    const dy = u < 0.35 ? (1 - u / 0.35) ** 2 * -600 : 0;
    const cy = y - r - 34 + dy;
    ctx.save();
    if (u > 0.25) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(130,255,170,0.25)";
      ctx.beginPath();
      ctx.moveTo(x - 14, cy + 12);
      ctx.lineTo(x + 14, cy + 12);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x - r, y + r);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    if (img) ctx.drawImage(img, x - 55, cy - 26, 110, (110 * img.naturalHeight) / img.naturalWidth);
    ctx.restore();
  }

  /** tâm miệng hố đen của Kẻ Nuốt Hành Tinh (px sân khấu) */
  private mawPos(): [number, number] {
    const a = BOSS_ART.devourer;
    const img = this.art("devourer");
    const h = img ? (a.width * img.naturalHeight) / img.naturalWidth : a.width;
    return [this.ux + (0.56 - a.cx) * a.width, this.uy + (0.55 - a.cy) * h];
  }

  /** xoáy hút trước miệng: các vòng xoắn ốc co vào tâm + dòng hút tới từng nạn nhân */
  private drawVortex(ctx: CanvasRenderingContext2D) {
    const dv = this.devour;
    if (!dv || !this.ufoAlive) return;
    const [mx, my] = this.mawPos();
    const u = clamp((this.time - dv.t0) / 5, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const f = 1 - ((this.time * 0.8 + i / 5) % 1);
      ctx.globalAlpha = (1 - f) * 0.8;
      ctx.strokeStyle = i % 2 ? "rgba(255,150,60,0.9)" : "rgba(190,90,255,0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * Math.PI * 2 + this.time * 3 + i;
        const rr = (60 + f * 260) * (0.75 + 0.25 * Math.sin(a * 3));
        const px = mx + Math.cos(a) * rr;
        const py = my + Math.sin(a) * rr * 0.75;
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.5 + 0.4 * u;
    ctx.drawImage(this.glows[1], mx - 140, my - 120, 280, 240);
    ctx.drawImage(this.glows[5], mx - 90, my - 80, 180, 160);
    // dòng hút tới nạn nhân
    for (const p of dv.victims) {
      const [px, py] = this.personPos(p);
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "rgba(255,170,90,0.7)";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.quadraticCurveTo((mx + px) / 2 + Math.sin(this.time * 5) * 40, (my + py) / 2, px, py);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** miệng rồng (px sân khấu) */
  private mouthPos(): [number, number] {
    const a = BOSS_ART.dragon;
    const img = this.art("dragon");
    const h = img ? (a.width * img.naturalHeight) / img.naturalWidth : a.width;
    return [this.ux + (0.6 - a.cx) * a.width, this.uy + (0.29 - a.cy) * h];
  }

  /** hơi thở hư không: luồng sáng tím quét ngang thành phố trong 1,4 giây */
  private drawBreath(ctx: CanvasRenderingContext2D) {
    const age = this.time - this.breathT;
    if (age < 0 || age > 1.4 || !this.ufoAlive) return;
    const [mx, my] = this.mouthPos();
    const k = age < 0.15 ? age / 0.15 : 1 - (age - 0.15) / 1.25;
    const sweep = -0.9 + (age / 1.4) * 1.8;
    const tx = CX + sweep * W * 0.6;
    const ty = PEOPLE_Y1;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const [w, col] of [[220, "rgba(120,60,255,0.18)"], [120, "rgba(170,110,255,0.35)"], [50, "rgba(230,210,255,0.85)"]] as const) {
      ctx.globalAlpha = k;
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.globalAlpha = k;
    ctx.drawImage(this.glows[5], tx - 220, ty - 120, 440, 240);
    ctx.drawImage(this.glows[2], mx - 60, my - 60, 120, 120);
    ctx.restore();
    if (Math.random() < 0.6) this.sparks(tx + rand(-80, 80), ty, 3, 400);
  }

  /** Boss có hoạt ảnh "attack": cứ 8–12 giây sạc rồi xả 5 tia laser đỏ xuống phố (hiệu ứng, không trừ gì) */
  private updateCounter() {
    const an = this.anim();
    if (!an || !an.has("attack") || this.bossDef.ability !== "none") return;
    if (this.attackAt === 0) this.attackAt = this.time + rand(5, 8);
    if (this.time < this.attackAt || an.playing(this.time)) return;
    this.attackAt = this.time + rand(8, 12);
    an.play("attack", this.time);
    this.sfx.bossAttack(this.bossDef.id);
    // khung thứ 3 của hoạt ảnh là lúc tia bắn ra
    const fire = this.time + 2 / (BOSS_ANIM[this.bossDef.id]!.meta.anims.attack.fps || 6);
    const geo = this.geo;
    const ppl = this.freePeople();
    for (let i = 0; i < 5; i++) {
      const p = ppl.length && Math.random() < 0.6 ? pick(ppl) : null;
      const [tx, ty] = p ? this.personPos(p) : [rand(80, W - 80), rand(GROUND_Y - 60, GROUND_Y + 80)];
      this.enemyShots.push({ dx: (i - 2) * geo.rx * 0.38, dy: geo.belly * 0.4, x1: tx, y1: ty, t0: fire + i * 0.035, p });
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
      this.sfx.hit(true, dr.x);
    }
  }

  /** Lời nhắc kỹ năng trùm đang diễn ra (thay dòng gợi ý) */
  private abilityLine(): [string, string] | null {
    const now = this.time;
    if (this.grab) return [`🐙 CỨU ${short(this.grab.p.user.name, 12).toUpperCase()}: ${fmt(this.grab.dealt)}/${fmt(this.grab.need)} · còn ${Math.ceil(6 - (now - this.grab.t0))}s`, "#d58bff"];
    if (this.devour) return [`🌀 CỨU ${this.devour.victims.length} NGƯỜI KHỎI HỐ ĐEN: ${fmt(this.devour.dealt)}/${fmt(this.devour.need)} · còn ${Math.ceil(5 - (now - this.devour.t0))}s`, "#ff9a3d"];
    if (this.charge && this.bossDef.ability === "breath") return [`🐉 NGẮT HƠI RỒNG: ${fmt(this.charge.dealt)}/${fmt(this.charge.need)} · còn ${Math.ceil(4 - (now - this.charge.t0))}s`, "#b98cff"];
    if (this.charge) return [`👁 NGẮT SẠC: ${fmt(this.charge.dealt)}/${fmt(this.charge.need)} · còn ${Math.ceil(5 - (now - this.charge.t0))}s`, "#ff5a5a"];
    if (this.cloaked) return ["👻 TÀU ĐANG TÀNG HÌNH — 70% ĐẠN BẮN TRƯỢT!", "#7fd8ff"];
    if (this.webHp > 0) return [`🕸 LƯỚI TƠ ${fmt(this.webHp)} — BÌNH LUẬN & QUÀ ĐỂ XÉ!`, "#9dff7a"];
    if (this.shieldHp > 0) return [`🛡 KHIÊN TINH THỂ: ${fmt(this.shieldHp)} — PHÁ KHIÊN TRƯỚC!`, "#7ff0ff"];
    const traitors = this.traitors.filter((t) => !t.dead).length;
    if (traitors) return [`😈 ${traitors} KẺ PHẢN BỘI ĐANG HỒI MÁU CHO UFO — BẮN HẠ CHÚNG!`, "#ff5a6e"];
    const drones = this.drones.filter((d) => !d.dead).length;
    if (drones) return [`🛸 ${drones} UFO CON ĐANG LAO XUỐNG — BẮN RƠI NGAY!`, "#ffb15a"];
    for (const [, t] of this.stun) if (t > now) return this.bossDef.id === "dragon" ? ["🌌 HƠI THỞ HƯ KHÔNG — NGƯỜI BỊ CHOÁNG GIẢM 50% SÁT THƯƠNG", "#b98cff"] : ["⚡ NGƯỜI BỊ CHOÁNG GIẢM 50% SÁT THƯƠNG", "#ff7a8a"];
    return null;
  }

  // ================= vẽ trùm =================

  private drawUfo(ctx: CanvasRenderingContext2D) {
    const d = this.bossDef;
    const art = this.art();
    const an = this.anim();
    if (an) {
      this.drawAnimated(ctx, an);
      return;
    }
    if (art) {
      this.drawArt(ctx, art);
      return;
    }
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

  /** Vẽ trùm bằng bộ chuyển động theo khung (idle / move / attack / hit) */
  private drawAnimated(ctx: CanvasRenderingContext2D, an: SpriteAnim) {
    const d = this.bossDef;
    const t = this.time;
    const g = this.geo;
    const size = an.meta.cell * this.animScale();
    const danger = this.phase === "battle" && this.progress > 0.75;
    const alpha = 1 - 0.85 * this.cloak;
    // bay ngang nhanh → chuyển động "move" (thân chao, phản lực dài); đứng yên → "idle"
    const base = Math.abs(this.uvx) > 70 ? "move" : "idle";
    const flip = 1;
    const frame = an.frame(t, base);
    const mo = MOTION[d.id];
    ctx.save();
    ctx.translate(this.ux, this.uy + Math.sin(t * mo.bobHz * Math.PI * 2) * mo.bob * 0.6);
    ctx.rotate(this.tilt * 0.25);
    ctx.imageSmoothingQuality = "high";
    // hào quang & ánh sáng hắt dưới bụng
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = (d.kind === "milestone" ? 0.38 : 0.2) * alpha + 0.06 * Math.sin(t * 3);
    const tint = danger ? 1 : d.id === "octopus" ? 5 : 4;
    ctx.drawImage(this.glows[tint], -g.rx * 1.35, g.cy - g.ry * 2.2, g.rx * 2.7, g.ry * 4.4);
    ctx.globalAlpha = (0.45 + 0.25 * Math.sin(t * 5)) * alpha;
    ctx.drawImage(this.glows[tint], -g.rx * 0.6, g.belly - 50, g.rx * 1.2, 100);
    ctx.restore();
    ctx.globalAlpha = alpha;
    ctx.scale(flip, 1);
    an.draw(ctx, frame, 0, 0, size);
    ctx.globalCompositeOperation = "lighter";
    if (this.hitFlash > 0.02) {
      ctx.globalAlpha = this.hitFlash * 0.3 * alpha;
      an.draw(ctx, frame, 0, 0, size);
    }
    // gần chạm đất: thân nháy đỏ báo động
    if (danger) {
      ctx.globalAlpha = Math.max(0, Math.sin(t * 12)) * 0.22;
      an.draw(ctx, frame, 0, 0, size);
    }
    ctx.scale(flip, 1);
    // hư hại nặng: lửa cháy trên thân
    if (this.hp / this.hpMax < 0.3) {
      for (const [fx, fy] of [[-0.6, -0.2], [0.45, 0.1], [0.1, -0.5]] as const) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 20 + fx * 10);
        const s = 50 + 14 * Math.sin(t * 13 + fy * 10);
        ctx.drawImage(this.glows[1], fx * g.rx - s, g.cy + fy * g.ry - s, s * 2, s * 2);
      }
    }
    ctx.restore();
  }

  /** Vẽ trùm bằng art vẽ tay + lớp hiệu ứng động hợp với từng trùm */
  private drawArt(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
    const d = this.bossDef;
    const a = BOSS_ART[d.id];
    const g = this.geo;
    const t = this.time;
    const w = a.width;
    const h = (w * img.naturalHeight) / img.naturalWidth;
    const ox = -w * a.cx;
    const oy = -h * a.cy;
    const at = (fx: number, fy: number): [number, number] => [ox + w * fx, oy + h * fy];
    const danger = this.phase === "battle" && this.progress > 0.75;
    const alpha = 1 - 0.85 * this.cloak;
    const AURA: Record<BossId, number> = { ufo: danger ? 1 : 4, ufo2: danger ? 1 : 6, ufo3: danger ? 1 : 6, gold: 0, octopus: 5, stealth: 6, spider: 4, devourer: 1, dragon: 5, crystal: 6, mother: 0, planet: 1 };
    ctx.save();
    const organic = d.id === "octopus" || d.id === "spider" || d.id === "dragon" || d.id === "devourer";
    // nhịp lơ lửng & chao nghiêng riêng từng trùm (đo từ video giới thiệu boss)
    const mo = MOTION[d.id];
    const TAU = Math.PI * 2;
    ctx.translate(this.ux, this.uy + Math.sin(t * mo.bobHz * TAU) * mo.bob);
    ctx.rotate(this.tilt * (organic ? 0.15 : 0.6) + Math.sin(t * mo.rollHz * TAU + 1) * mo.roll + t * mo.spin);
    ctx.imageSmoothingQuality = "high";
    // hào quang sau lưng (trùm mốc rực hơn)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = (d.kind === "milestone" ? 0.38 : 0.22) * alpha + 0.08 * Math.sin(t * 3);
    ctx.drawImage(this.glows[AURA[d.id]], -w * 0.62, g.cy - h * 0.55, w * 1.24, h * 1.1);
    // ánh sáng hắt dưới bụng đĩa
    if (d.id === "ufo" || d.id === "ufo2" || d.id === "gold" || d.id === "mother") {
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 5);
      ctx.drawImage(this.glows[d.id === "gold" ? 0 : danger ? 1 : 4], -w * 0.28, g.belly - 50, w * 0.56, 90);
    }
    ctx.restore();
    const fx: FxCtx = { t, w, h, at, glows: this.glows, alpha, danger };
    bossUnder(ctx, d.id, fx);

    // thân: tàng hình thì nhiễu sóng thành từng lát lệch ngang
    ctx.globalAlpha = alpha;
    if (this.cloak > 0.05) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const jx = (Math.random() - 0.5) * 40 * this.cloak;
        ctx.drawImage(img, 0, (img.naturalHeight * i) / n, img.naturalWidth, img.naturalHeight / n, ox + jx, oy + (h * i) / n, w, h / n);
      }
    } else if (organic) {
      const warp = d.id === "spider" ? this.spiderWarp(w, h, t) : d.id === "dragon" ? this.dragonWarp(w, h, t) : d.id === "devourer" ? this.devourerWarp(w, h, t) : this.octopusWarp(w, h, t);
      drawWarped(ctx, img, ox, oy, w, h, d.id === "dragon" ? 12 : d.id === "spider" ? 10 : 8, 12, warp);
    }
    else ctx.drawImage(img, ox, oy, w, h);
    ctx.globalCompositeOperation = "lighter";
    if (this.hitFlash > 0.02) {
      ctx.globalAlpha = this.hitFlash * 0.32 * alpha;
      // bạch tuộc: chớp bằng quầng sáng thay vì vẽ lại cả lưới (đỡ tốn)
      if (organic) ctx.drawImage(this.glows[2], -w * 0.45, g.cy - h * 0.35, w * 0.9, h * 0.6);
      else ctx.drawImage(img, ox, oy, w, h);
    }
    ctx.globalAlpha = alpha;
    switch (d.id) {
      case "ufo2": {
        // cổng hút dưới bụng đập sáng, vòm kính lấp lánh, 4 động cơ phụt xanh
        const [px, py] = at(0.5, 0.86);
        ctx.globalAlpha = (0.55 + 0.45 * Math.sin(t * 4)) * alpha;
        ctx.drawImage(this.glows[6], px - 70, py - 30, 140, 60);
        const [dx, dy] = at(0.5, 0.16);
        ctx.globalAlpha = (0.25 + 0.2 * Math.sin(t * 2.3)) * alpha;
        ctx.drawImage(this.glows[2], dx - 110, dy - 60, 220, 120);
        for (const [fx, fy] of [[0.15, 0.73], [0.32, 0.9], [0.68, 0.9], [0.85, 0.73]] as const) {
          const [ex, ey] = at(fx, fy);
          ctx.globalAlpha = (0.6 + 0.4 * Math.random()) * alpha;
          ctx.drawImage(this.glows[6], ex - 24, ey - 10, 48, 48);
        }
        break;
      }
      case "ufo3": {
        // lõi plasma đập + tia điện tím chập chờn quanh vòng
        const [cx, cy] = at(0.5, 0.42);
        const p = 0.5 + 0.5 * Math.sin(t * 5);
        ctx.globalAlpha = (0.45 + 0.45 * p) * alpha;
        ctx.drawImage(this.glows[6], cx - 120 - 30 * p, cy - 120 - 30 * p, 240 + 60 * p, 240 + 60 * p);
        ctx.drawImage(this.glows[2], cx - 40, cy - 40, 80, 80);
        if (Math.random() < 0.5) {
          ctx.globalAlpha = 0.8 * alpha;
          ctx.strokeStyle = "rgba(200,140,255,0.9)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          let [x, y] = at(0.5 + (Math.random() - 0.5) * 0.5, 0.55);
          ctx.moveTo(x, y);
          for (let i = 0; i < 5; i++) {
            x += (Math.random() - 0.5) * 50;
            y += (Math.random() - 0.5) * 30;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        break;
      }
      case "ufo": {
        // vành đèn đỏ thở theo nhịp, gần đất thì nháy gấp
        ctx.globalAlpha = (danger ? 0.5 + 0.5 * Math.sin(t * 14) : 0.35 + 0.25 * Math.sin(t * 3)) * alpha;
        const [bx, by] = at(0.5, 0.77);
        ctx.drawImage(this.glows[1], bx - w * 0.42, by - 26, w * 0.84, 52);
        break;
      }
      case "gold": {
        // lấp lánh trên gai vàng
        for (let i = 0; i < 3; i++) {
          const k = Math.floor(t * 2 + i * 7.3);
          const fx = 0.12 + ((k * 37) % 76) / 100;
          const fy = 0.08 + ((k * 53) % 70) / 100;
          ctx.globalAlpha = Math.max(0, Math.sin((t * 2 + i * 0.33) % 1 * Math.PI)) * alpha;
          const [sx, sy] = at(fx, fy);
          ctx.drawImage(this.glows[3], sx - 24, sy - 24, 48, 48);
        }
        break;
      }
      case "octopus": {
        const blink = t % 4 < 0.15 ? 0.1 : 1;
        for (const [fx, fy] of [[0.445, 0.27], [0.652, 0.244]] as const) {
          ctx.globalAlpha = (0.45 + 0.25 * Math.sin(t * 5)) * blink * alpha;
          const [ex, ey] = at(fx, fy);
          ctx.drawImage(this.glows[0], ex - 40, ey - 32, 80, 64);
        }
        break;
      }
      case "stealth": {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6);
        const [ex, ey] = at(0.5, 0.46);
        ctx.drawImage(this.glows[1], ex - 70, ey - 34, 140, 68);
        break;
      }
      case "crystal": {
        // lõi plasma & mảnh tinh thể bay vòng: xem bossfx.ts
        if (this.shieldHp > 0) {
          const k = this.shieldHp / Math.max(1, this.shieldMax);
          const R = 270;
          ctx.strokeStyle = `rgba(127,240,255,${0.35 + 0.4 * k})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, R, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 0.15 + 0.2 * k;
          ctx.lineWidth = 2;
          for (let i = 0; i < 12; i++) {
            const an = (i / 12) * Math.PI * 2 + t * 0.3;
            ctx.beginPath();
            ctx.ellipse(0, 0, R * Math.abs(Math.cos(an)), R, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        break;
      }
      case "mother": {
        for (let i = 0; i < 5; i++) {
          ctx.globalAlpha = (0.5 + 0.5 * Math.sin(t * 3 + i)) * alpha;
          const [hx, hy] = at(0.32 + i * 0.09, 0.6);
          ctx.drawImage(this.glows[0], hx - 26, hy - 14, 52, 28);
        }
        ctx.globalAlpha = Math.sin(t * 4) > 0 ? 1 : 0.2;
        for (const fx of [0.29, 0.72]) {
          const [tx, ty] = at(fx, 0.07);
          ctx.drawImage(this.glows[1], tx - 16, ty - 16, 32, 32);
        }
        break;
      }
      case "planet": {
        // dung nham phập phồng; sạc pháo thì lõi rực trắng & vòng năng lượng co vào tâm
        ctx.globalAlpha = 0.12 + 0.12 * Math.sin(t * 2.2);
        ctx.drawImage(img, ox, oy, w, h);
        const ck = this.charge ? clamp((t - this.charge.t0) / 5, 0, 1) : 0;
        if (ck > 0) {
          ctx.globalAlpha = 0.5 + 0.5 * ck;
          const s = 120 + 220 * ck;
          ctx.drawImage(this.glows[1], -s, -s, s * 2, s * 2);
          ctx.drawImage(this.glows[2], -s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
          for (let i = 0; i < 4; i++) {
            const f = 1 - ((t * 1.4 + i / 4) % 1);
            ctx.globalAlpha = (1 - f) * 0.9;
            ctx.strokeStyle = "#ff5a5a";
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(0, 0, 60 + f * 280, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        break;
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    bossOver(ctx, d.id, fx);
    ctx.globalCompositeOperation = "lighter";
    // hư hại nặng: lửa cháy trên thân
    if (this.hp / this.hpMax < 0.3) {
      for (const [fx, fy] of [[-0.6, -0.2], [0.45, 0.1], [0.1, -0.5]] as const) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 20 + fx * 10);
        const s = 55 + 14 * Math.sin(t * 13 + fy * 10);
        ctx.drawImage(this.glows[1], fx * g.rx - s, g.cy + fy * g.ry - s, s * 2, s * 2);
      }
    }
    ctx.restore();
  }

  /**
   * Biến dạng art bạch tuộc mỗi khung: đầu phình–xẹp theo nhịp bơi; xúc tu (dưới vành mũ, v > 0.5)
   * uốn sóng từ gốc ra ngọn, mỗi xúc tu lệch pha theo vị trí ngang, xoè ra rồi khép lại như sứa đẩy nước.
   * Khi đang tóm người thì các xúc tu quẫy mạnh hơn.
   */
  /**
   * Chân nhện bò: phần dưới ảnh (chân) nhấc–đặt so le từng cặp, ngọn chân cào nhẹ; súng trên lưng giật khi giăng tơ.
   */
  /**
   * Rồng: 2 cánh vỗ (xoay quanh vai — đầu cánh đi xa nhất), ngực phập phồng, đuôi quẫy,
   * đầu rướn lên khi đang hít hơi thở hư không.
   */
  private dragonWarp(w: number, h: number, t: number) {
    const flap = Math.sin(t * 2.2);
    const inhale = this.charge && this.bossDef.ability === "breath" ? clamp((t - this.charge.t0) / 4, 0, 1) : 0;
    const shoulders: [number, number, number][] = [[0.31, 0.42, -1], [0.63, 0.4, 1]];
    return (u: number, v: number): [number, number] => {
      let dx = 0;
      let dy = 0;
      for (const [su, sv, side] of shoulders) {
        // vùng cánh: phía ngoài vai & phía trên hông
        const out = side < 0 ? su - u : u - su;
        if (out <= 0 || v > 0.7) continue;
        const r = Math.hypot(out * w, (sv - v) * h);
        const k = Math.min(1, out / 0.28) * (1 - Math.max(0, (v - 0.45) / 0.25));
        const a = flap * 0.22 * k;
        // xoay điểm quanh vai một góc a (cánh dương lên cùng lúc 2 bên)
        const px = (u - su) * w;
        const py = (v - sv) * h;
        dx += (px * Math.cos(a * side) - py * Math.sin(a * side) - px) * 1;
        dy += (px * Math.sin(a * side) + py * Math.cos(a * side) - py) * 1 - flap * 6 * k * (r / w);
      }
      // ngực phập phồng
      const chest = Math.exp(-(((u - 0.45) / 0.12) ** 2 + ((v - 0.5) / 0.15) ** 2));
      dx += (u - 0.45) * w * 0.04 * Math.sin(t * 1.6) * chest;
      // đuôi quẫy (góc dưới phải)
      if (v > 0.65 && u > 0.4) {
        const k = ((v - 0.65) / 0.35) * Math.min(1, (u - 0.4) / 0.4);
        dx += Math.sin(t * 1.8 + u * 5) * 16 * k;
        dy += Math.cos(t * 1.8 + u * 5) * 8 * k;
      }
      // đầu rướn ngửa khi hít hơi
      const head = Math.exp(-(((u - 0.58) / 0.1) ** 2 + ((v - 0.25) / 0.12) ** 2));
      dy -= inhale * 26 * head;
      dx -= inhale * 10 * head;
      return [dx, dy];
    };
  }

  /**
   * Kẻ Nuốt Hành Tinh: miệng hố đen nhai (giãn–co quanh tâm miệng, há rộng khi đang hút),
   * các vuốt gai bên ngoài xoay nhẹ quanh thân như đang cuộn lại.
   */
  private devourerWarp(w: number, h: number, t: number) {
    const open = this.devour ? 0.5 + 0.5 * clamp((t - this.devour.t0) / 1, 0, 1) : 0;
    const spit = clamp(1 - (t - this.spitT) / 0.6, 0, 1);
    const chew = Math.sin(t * 3.2) * 0.5 + 0.5;
    const MX = 0.56;
    const MY = 0.55;
    return (u: number, v: number): [number, number] => {
      const dx = (u - MX) * w;
      const dy = (v - MY) * h;
      const r = Math.hypot(dx, dy) / w;
      // miệng: đẩy ra xa tâm (há) theo hàm chuông
      const mouth = Math.exp(-((r / 0.2) ** 2));
      const k = (0.05 + 0.08 * chew + 0.22 * open + 0.2 * spit) * mouth;
      // gai ngoài: xoay quanh tâm thân
      const cx = (u - 0.5) * w;
      const cy = (v - 0.52) * h;
      const outer = Math.max(0, Math.hypot(cx, cy) / w - 0.32) * 2.5;
      const a = Math.sin(t * 1.3) * 0.05 * outer + (this.devour ? 0.08 * Math.sin(t * 6) * outer : 0);
      const rx = cx * Math.cos(a) - cy * Math.sin(a) - cx;
      const ry = cx * Math.sin(a) + cy * Math.cos(a) - cy;
      return [dx * k + rx, dy * k + ry];
    };
  }

  private spiderWarp(w: number, h: number, t: number) {
    const fast = this.webHp > 0 && this.time - this.webT0 < 0.8 ? 2 : 1;
    return (u: number, v: number): [number, number] => {
      if (v < 0.42) {
        const recoil = v < 0.3 && Math.abs(u - 0.5) > 0.15 && fast > 1 ? Math.sin(t * 40) * 4 : 0;
        return [0, recoil];
      }
      const k = (v - 0.42) / 0.58;
      const e = k * k;
      const side = u < 0.5 ? -1 : 1;
      const ph = t * 5.5 * fast + Math.floor(Math.abs(u - 0.5) * 8) * Math.PI * 0.9 + (side > 0 ? Math.PI : 0);
      const lift = Math.max(0, Math.sin(ph));
      return [side * Math.cos(ph) * 9 * e, -lift * 16 * e];
    };
  }

  private octopusWarp(w: number, h: number, t: number) {
    const ROOT = 0.52;
    const swim = Math.sin(t * 1.5);
    const kick = Math.sin(t * 1.5 - 0.9);
    const wild = this.grab ? 1.7 : 1;
    return (u: number, v: number): [number, number] => {
      const x = (u - 0.5) * w;
      if (v < ROOT) {
        const k = (ROOT - v) / ROOT;
        return [x * 0.04 * swim * (1 - 0.4 * k), -k * h * 0.025 * swim];
      }
      const s = (v - ROOT) / (1 - ROOT);
      const e = s * s;
      // sóng chạy chậm từ gốc ra ngọn + ngọn cuộn vòng (lệch pha theo từng xúc tu) — như video
      const ph = u * 11;
      const wave = Math.sin(t * 1.7 * wild - s * 3.6 + ph) * 26 * wild * e;
      const spread = x * 0.12 * e * kick;
      const curlA = t * 1.1 + ph * 0.7;
      const curl = s * s * s * 34 * wild;
      return [wave + spread + Math.cos(curlA) * curl, -kick * 14 * e + Math.sin(curlA) * curl * 0.8];
    };
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

  /** tia laser đỏ boss bắn trả: chớp sáng ở điểm chạm, bong bóng bị trúng nảy lên */
  /** Lưới tơ: mạng nhện toả từ bụng nhện xuống, mờ dần khi bị xé */
  private drawWeb(ctx: CanvasRenderingContext2D) {
    if (this.webHp <= 0 || !this.ufoAlive || this.bossDef.ability !== "web") return;
    const grow = clamp((this.time - this.webT0) / 0.5, 0, 1);
    const k = this.webHp / Math.max(1, this.webMax);
    const cx = this.ux;
    const cy = this.uy + this.belly * 0.55;
    const R = 340 * (0.3 + 0.7 * grow);
    const spokes = 16;
    const rings = 7;
    ctx.save();
    ctx.lineCap = "round";
    const pt = (i: number, j: number): [number, number] => {
      const a = (i / spokes) * Math.PI * 2 + 0.1;
      const rr = (R * j) / rings;
      // tơ hơi võng & rung theo gió
      const sag = Math.sin(this.time * 2 + i) * 3;
      return [cx + Math.cos(a) * rr + sag, cy + Math.sin(a) * rr * 0.62 + sag];
    };
    for (const [w, col] of [[5, `rgba(125,255,74,${0.18 * k})`], [1.6, `rgba(235,255,225,${0.75 * k})`]] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let i = 0; i < spokes; i++) {
        const [x, y] = pt(i, rings);
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
      }
      for (let j = 1; j <= rings; j++) {
        for (let i = 0; i <= spokes; i++) {
          const [x0, y0] = pt(i % spokes, j);
          const [x1, y1] = pt((i + 1) % spokes, j);
          // đoạn nối giữa 2 nan võng vào trong
          const mx = (x0 + x1) / 2 + (cx - (x0 + x1) / 2) * 0.08;
          const my = (y0 + y1) / 2 + (cy - (y0 + y1) / 2) * 0.08;
          if (i === 0) ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(mx, my, x1, y1);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawEnemyShots(ctx: CanvasRenderingContext2D) {
    if (!this.enemyShots.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const e of this.enemyShots) {
      const age = this.time - e.t0;
      if (age < 0) continue;
      const k = 1 - age / 0.5;
      const ux = this.ux + e.dx;
      for (const [w, col] of [[22, "rgba(255,40,40,0.25)"], [9, "rgba(255,90,80,0.8)"], [3, "rgba(255,240,230,1)"]] as const) {
        ctx.globalAlpha = k;
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(ux, this.uy + e.dy);
        ctx.lineTo(e.x1, e.y1);
        ctx.stroke();
      }
      ctx.drawImage(this.glows[1], e.x1 - 40 * k, e.y1 - 40 * k, 80 * k, 80 * k);
      if (age < 0.04 && e.p) {
        e.p.pulse = 1;
        this.sparks(e.x1, e.y1, 6, 300);
      }
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
      const mini = this.art("ufo");
      if (mini) ctx.drawImage(mini, dr.x - 55, dr.y - 26, 110, (110 * mini.naturalHeight) / mini.naturalWidth);
      else {
        const ds = 0.2;
        ctx.drawImage(this.sprite("ufo"), dr.x - SCX * ds, dr.y - SCY * ds, this.sprite("ufo").width * ds, this.sprite("ufo").height * ds);
      }
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
      ctx.globalAlpha = fade * 0.3;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 20;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.globalAlpha = fade;
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
        const sweep = Math.sin(this.time * 6) * 0.2 * this.geo.rx;
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
      text(ctx, "TIẾP TẾ", x, y + 48, 22, "#ffd55a", "center", 900);
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
    if (this.playerBoss && this.phase !== "break") fitText(ctx, `👑 TRÙM NGƯỜI XEM: ${this.playerBoss.name.toUpperCase()} 👑`, CX, SAFE.top + 22, 30, W - 120, "#ffd55a");
    else fitText(ctx, bossOn ? `★ ${this.bossLabel()}: ${d.name.toUpperCase()} ★` : "BẢO VỆ TRÁI ĐẤT", CX, SAFE.top + 22, bossOn ? 30 : 34, W - 120, bossOn ? d.color : "#9dff7a");
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
      const tips = [...TIPS, "👑 QUÀ LỚN = VÒNG SAU LÀM TRÙM", "😈 BÌNH LUẬN “ĐỔI PHE” = THÀNH UFO ĐỎ"];
      const tip = tips[Math.floor(this.time / 3.5) % tips.length];
      this.drawFund(ctx);
      const ab = this.abilityLine();
      if (ab) {
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.time * 8);
        fitText(ctx, ab[0], CX, SAFE.top + 206, 26, W - 100, ab[1]);
        ctx.globalAlpha = 1;
      } else if (this.progress <= 0.75) text(ctx, tip, CX, SAFE.top + 206, 26, "#ffe08a", "center", 800);
      this.drawAltimeter(ctx);
      // bảng TOP XẠ THỦ (góc phải, y 520–720) mờ đi khi thân trùm che lên
      const over = this.ufoAlive && this.ux + this.geo.rx > W - 320 && Math.abs(this.uy + this.geo.cy - 620) < this.geo.ry + 120;
      this.topAlpha = approach(this.topAlpha, over ? 0.18 : 1, 6, 1 / 60);
      if (this.progress <= 0.75) {
        ctx.globalAlpha = this.topAlpha;
        this.drawTopShooters(ctx);
        ctx.globalAlpha = 1;
      }
    }
    if (this.status) text(ctx, `● ${this.status}`, 24, H - 24, 18, "#ff8a8a", "left", 700);
    if (this.demo) this.drawDemoBadge(ctx);
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

  /**
   * Chế độ thử: dán nhãn to & rõ để không ai nhầm người xem / quà giả lập là thật
   * (lỡ phát trang demo lên live mà không có nhãn = tương tác giả, vi phạm chính sách live).
   */
  private drawDemoBadge(ctx: CanvasRenderingContext2D) {
    const msg = "CHẾ ĐỘ THỬ · người xem & quà đều là giả lập";
    ctx.font = font(800, 26);
    const w = ctx.measureText(msg).width + 56;
    const y = 112;
    ctx.fillStyle = "rgba(120, 10, 20, 0.85)";
    ctx.strokeStyle = "#ff6a7a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(CX - w / 2, y - 24, w, 48, 24);
    ctx.fill();
    ctx.stroke();
    text(ctx, msg, CX, y + 1, 26, "#fff", "center", 800);
  }

  /** Năng lượng phòng thủ (mọi tương tác góp) → ĐẠN VÀNG ×2; khi đang bật thì hiện thời gian còn lại */
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
      : `⚡ NĂNG LƯỢNG PHÒNG THỦ ${Math.floor(clamp(this.fund / this.fundGoal, 0, 0.99) * 100)}% → ĐẠN VÀNG ×2`;
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
      if (this.playerBoss) {
        if (blink) fitText(ctx, "👑 TRÙM NGƯỜI XEM XUẤT HIỆN 👑", CX, 775, 48, W - 80, "#fff");
        fitText(ctx, `${this.playerBoss.name.toUpperCase()} ĐIỀU KHIỂN ${d.name.toUpperCase()}!`, CX, 845, 46, W - 80, "#ffd55a");
      } else if (this.boss) {
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
      if (this.playerBoss) {
        fitText(ctx, `HẠ GỤC TRÙM ${this.playerBoss.name.toUpperCase()}!`, 0, -30, 66, W - 80, "#ffd55a");
        text(ctx, `🔥 CHUỖI THẮNG ${this.streak}`, 0, 40, 34, "#ffffff", "center", 900);
      } else if (this.boss) {
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
      const dd = DEFEATS[d.id];
      if (this.playerBoss) {
        fitText(ctx, `👑 ${this.playerBoss.name.toUpperCase()}`, 0, -50, 64, W - 80, "#ffd55a");
        fitText(ctx, "ĐÃ CHIẾM TRÁI ĐẤT!", 0, 30, 88, W - 60, dd.color);
      } else {
        fitText(ctx, dd.title1, 0, -50, 64, W - 80, "#ffffff");
        fitText(ctx, dd.title2, 0, 30, 92, W - 60, dd.color);
      }
      ctx.restore();
      if (t > 2) {
        ctx.globalAlpha = fade * clamp((t - 2) / 0.4, 0, 1);
        fitText(ctx, dd.sub.replace("{n}", String(this.abducted)), CX, 730, 32, W - 100, "#ffe08a", 800);
        if (this.lostStreak > 1) text(ctx, `💔 Chuỗi ${this.lostStreak} trận thắng bị ${this.boss ? d.name : "UFO"} cắt đứt`, CX, 780, 30, "#ff8a8a", "center", 800);
        else fitText(ctx, dd.revenge, CX, 780, 30, W - 100, "#fff", 700);
      }
      ctx.globalAlpha = 1;
    } else if (this.phase === "break") {
      const k = clamp(t / 0.4, 0, 1) * clamp((BREAK_T - t) / 0.3, 0, 1);
      ctx.globalAlpha = k;
      ctx.fillStyle = "rgba(5,8,20,0.55)";
      ctx.beginPath();
      ctx.roundRect(110, 560, W - 220, 420, 32);
      ctx.fill();
      fitText(ctx, this.round === 0 ? "SẴN SÀNG BẢO VỆ TRÁI ĐẤT?" : this.lastLost ? DEFEATS[d.id].free : "TRÁI ĐẤT VẪN AN TOÀN!", CX, 620, 36, W - 260, "#9dff7a");
      text(ctx, "VÒNG TIẾP THEO SAU", CX, 690, 30, "#fff", "center", 800);
      text(ctx, `${Math.max(0, Math.ceil(BREAK_T - t))}`, CX, 790, 120, "#ffd55a", "center", 900);
      // chuỗi thắng & trùm mốc kế tiếp: giữ người xem ở lại
      const next = nextMilestone(this.streak);
      const nb = BOSSES[milestoneBoss(next)];
      if (this.bossQueue.length) {
        ctx.globalAlpha = k * (0.7 + 0.3 * Math.sin(this.time * 8));
        fitText(ctx, `👑 VÒNG SAU: TRÙM ${this.bossQueue[0].name.toUpperCase()}${this.bossQueue.length > 1 ? ` · còn ${this.bossQueue.length - 1} người chờ` : ""}`, CX, 878, 30, W - 260, "#ffd55a");
        ctx.globalAlpha = k;
      } else if (isMilestone(this.streak)) {
        ctx.globalAlpha = k * (0.7 + 0.3 * Math.sin(this.time * 8));
        fitText(ctx, `⚠ VÒNG SAU: TRÙM ${BOSSES[milestoneBoss(this.streak)].name.toUpperCase()}!`, CX, 878, 32, W - 260, BOSSES[milestoneBoss(this.streak)].color);
        ctx.globalAlpha = k;
      } else {
        fitText(ctx, `🔥 Chuỗi thắng ${this.streak} · thắng thêm ${next - this.streak} trận gặp ${nb.name}`, CX, 878, 26, W - 260, "#ffd55a", 800);
      }
      text(ctx, `Kỷ lục chuỗi: ${this.bestStreak}`, CX, 918, 22, "rgba(255,255,255,0.7)", "center", 700);
      text(ctx, "❤️ tim · 💬 bình luận · 🎁 quà · ➕ follow", CX, 955, 24, "rgba(255,255,255,0.85)", "center", 700);
      this.drawGuide(ctx, 1000);
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
  // ================= vai trò người xem: trùm người xem & kẻ phản bội =================

  /** Xử lý tương tác của trùm người xem / kẻ phản bội / lệnh đổi phe. Trả về true nếu đã xử lý xong. */
  private handleRoles(e: LiveEvent, user: LiveUser, person: Person, fighting: boolean): boolean {
    if (e.type !== "like" && e.type !== "chat" && e.type !== "gift") return false;
    const chat = e.type === "chat" ? e.text : "";
    // 1) trùm người xem: tương tác của họ giúp trùm (hồi máu, có trần 30% máu / vòng), không bắn chính mình
    if (this.playerBoss?.id === user.id && (this.phase === "battle" || this.phase === "intro")) {
      if (fighting) {
        const heal = e.type === "like" ? Math.max(1, e.count) * this.bal.likeDmg * 0.5 : e.type === "chat" ? this.bal.chatDmg : Math.max(1, e.coins) * Math.max(1, e.count) * this.bal.giftDmg * 0.4;
        this.healBoss(heal, "bossHeal", 0.3, this.ux, this.uy - this.geo.ry);
      }
      return true;
    }
    const tr = this.traitors.find((t) => !t.dead && t.user.id === user.id);
    if (tr) {
      // tặng quà / bình luận "về phe" → quay về phe Trái Đất (quà vẫn bắn như thường)
      if (e.type === "gift" || isReturn(chat)) {
        this.releaseTraitor(tr, true);
        this.toast(`🌍 ${user.name} quay về phe Trái Đất!`, "Hoan nghênh trở lại", "#9dff7a", user, 1);
        return e.type !== "gift";
      }
      if (!fighting) return true;
      // kẻ phản bội thả tim / bình luận: bắn tia đỏ xuống phố & hồi máu cho UFO (trần 15% máu / vòng)
      const heal = e.type === "like" ? Math.max(1, e.count) * this.bal.likeDmg * 0.6 : this.bal.chatDmg * 1.5;
      this.healBoss(heal, "traitorHeal", 0.15, tr.x, tr.y - 40);
      const victim = this.people.filter((p) => p.suck < 0 && !this.isRoleUser(p.user.id));
      if (victim.length && this.redBolts.length < 30) {
        const v = pick(victim);
        const [vx, vy] = this.personPos(v);
        this.redBolts.push({ x0: tr.x, y0: tr.y + 24, x1: vx, y1: vy, t0: this.time });
        v.pulse = 1;
        this.sfx.laser(tr.x, "zap", false);
      }
      return true;
    }
    // 2) bình luận đổi phe → UFO đỏ (trong trận, tối đa 8 kẻ phản bội cùng lúc)
    if (e.type === "chat" && isDefect(chat) && (this.phase === "battle" || this.phase === "intro") && this.ufoAlive) {
      const cd = this.defectCd.get(user.id) ?? -99;
      if (this.time < cd) {
        this.floatText("⏳ chờ chút mới đổi phe lại được", ...this.personPos(person), "#ff8a8a", 22);
        return true;
      }
      if (this.traitors.filter((t) => !t.dead).length >= 8) return false;
      this.makeTraitor(user, person);
      return true;
    }
    // 3) quà lớn → vào hàng chờ làm trùm (quà vẫn bắn như thường ở vòng này)
    if (e.type === "gift" && Math.max(1, e.coins) * Math.max(1, e.count) >= this.bal.bossGift) this.queueBoss(user);
    return false;
  }

  private isRoleUser(id: string) {
    return this.playerBoss?.id === id || this.traitors.some((t) => !t.dead && t.user.id === id);
  }

  private healBoss(amount: number, pool: "bossHeal" | "traitorHeal", cap: number, x: number, y: number) {
    if (this.phase !== "battle" || this.hp <= 0) return;
    const room = Math.max(0, this.hpMax * cap - this[pool]);
    const h = Math.min(amount, room, this.hpMax - this.hp);
    if (h <= 0) return;
    this.hp += h;
    this[pool] += h;
    if (h >= 2 || Math.random() < 0.3) this.floatText(`+${fmt(h)}`, x + rand(-30, 30), y, "#7dff9a", h >= 10 ? 30 : 22);
  }

  private queueBoss(user: LiveUser) {
    if (this.playerBoss?.id === user.id) return;
    if (this.bossQueue.some((u) => u.id === user.id)) return;
    if (this.bossQueue.length >= 10) return;
    this.bossQueue.push(user);
    const n = this.bossQueue.length;
    this.toast(`👑 ${user.name} sẽ làm TRÙM UFO!`, n === 1 ? "Ở vòng tiếp theo — cả phòng chuẩn bị!" : `Xếp hàng thứ ${n}`, "#ffd55a", user, 3);
    this.sfx.golden();
  }

  private makeTraitor(user: LiveUser, person: Person) {
    const [x, y] = this.personPos(person);
    const max = Math.max(20, Math.round(this.hpMax * 0.04));
    this.traitors.push({ user, x, y, tx: x, ty: PEOPLE_Y0 - 220, hp: max, max, t0: this.time, hitT: -99, dead: false });
    this.sparks(x, y, 30, 600);
    this.blasts.push({ x, y, t: this.time, color: "#ff3b4e", size: 90 });
    this.toast(`😈 ${user.name} ĐỔI PHE!`, "Thành UFO đỏ — cả phòng bắn hạ kẻ phản bội!", "#ff5a6e", user, 2);
    this.sfx.bossAttack(this.bossDef.id);
  }

  /** thả kẻ phản bội về phe Trái Đất (bong bóng bật ra lại dưới phố) */
  private releaseTraitor(tr: Traitor, cooldown: boolean) {
    tr.dead = true;
    if (cooldown) this.defectCd.set(tr.user.id, this.time + 20);
    const p = this.people.find((q) => q.user.id === tr.user.id);
    if (p) {
      p.born = this.time;
      p.pulse = 1;
    }
  }

  private hitTraitor(tr: Traitor, dmg: number, user: LiveUser, boost: boolean) {
    if (boost && this.golden) dmg *= 2;
    const d = Math.min(tr.hp, dmg);
    tr.hp -= d;
    tr.hitT = this.time;
    const rec = this.roundDmg.get(user.id) ?? { user, dmg: 0 };
    rec.dmg += d;
    this.roundDmg.set(user.id, rec);
    if (tr.hp <= 0 && !tr.dead) {
      this.blasts.push({ x: tr.x, y: tr.y, t: this.time, color: "#ff3b4e", size: 150 });
      this.firework(tr.x, tr.y, "#ff3b4e", 36);
      this.sparks(tr.x, tr.y, 40, 800);
      this.shake = Math.max(this.shake, 8);
      this.sfx.hit(true, tr.x);
      this.toast(`💥 ${user.name} bắn hạ kẻ phản bội!`, `${tr.user.name} bị đưa về phe Trái Đất`, "#ff8a5a", user, 2);
      this.releaseTraitor(tr, true);
    }
  }

  private updateTraitors(dt: number) {
    const left = this.visible.left + 90;
    const right = this.visible.right - 90;
    for (const tr of this.traitors) {
      if (tr.dead) continue;
      // lượn trong vùng trên đầu người chơi, đổi điểm đến khi tới gần
      if (Math.hypot(tr.tx - tr.x, tr.ty - tr.y) < 30) {
        tr.tx = rand(left, Math.max(left, right));
        tr.ty = rand(PEOPLE_Y0 - 330, PEOPLE_Y0 - 90);
      }
      tr.x = approach(tr.x, tr.tx, 1.1, dt);
      tr.y = approach(tr.y, tr.ty, 1.1, dt);
    }
    this.traitors = this.traitors.filter((t) => !t.dead);
    this.redBolts = this.redBolts.filter((b) => this.time - b.t0 < 0.45);
  }

  private drawTraitors(ctx: CanvasRenderingContext2D) {
    if (this.redBolts.length) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const b of this.redBolts) {
        const k = 1 - (this.time - b.t0) / 0.45;
        for (const [w, col] of [[16, "rgba(255,30,50,0.3)"], [5, "rgba(255,90,90,0.9)"], [2, "rgba(255,235,230,1)"]] as const) {
          ctx.globalAlpha = k;
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(b.x0, b.y0);
          ctx.lineTo(b.x1, b.y1);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    for (const tr of this.traitors) {
      if (tr.dead) continue;
      drawTraitor(ctx, tr, this.avatars.get(tr.user), this.time, (s, x, y) => text(ctx, short(s, 14), x, y, 22, "#ffb0b0", "center", 800));
    }
  }

  /** ảnh đại diện của trùm người xem gắn trên thân trùm + vương miện & tên */
  private drawPlayerBoss(ctx: CanvasRenderingContext2D) {
    const u = this.playerBoss!;
    const r = 64;
    const x = this.ux;
    const y = this.uy + this.geo.cy - this.geo.ry * 0.35;
    ctx.save();
    ctx.globalAlpha = this.cloaked ? 0.35 : 1;
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.9);
    g.addColorStop(0, "rgba(255,213,90,0.55)");
    g.addColorStop(1, "rgba(255,213,90,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(this.avatars.get(u), x - r, y - r, r * 2, r * 2);
    ctx.restore();
    ctx.strokeStyle = "#ffd55a";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, "👑", x, y - r - 22, 46, "#fff", "center", 400);
    const name = short(u.name, 16);
    ctx.font = font(900, 26);
    const w = ctx.measureText(name).width + 30;
    ctx.fillStyle = "rgba(40,24,0,0.85)";
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y + r + 8, w, 38, 19);
    ctx.fill();
    text(ctx, name, x, y + r + 28, 26, "#ffd55a", "center", 900);
    ctx.restore();
  }

  /** Bảng hướng dẫn tương tác (màn nghỉ giữa các vòng) */
  private drawGuide(ctx: CanvasRenderingContext2D, y0: number) {
    const rows = guideRows();
    const half = Math.ceil(rows.length / 2);
    const rh = 40;
    const x0 = 70;
    const w = W - 140;
    const h = 64 + half * rh;
    ctx.fillStyle = "rgba(5,8,20,0.92)";
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, 28);
    ctx.fill();
    ctx.strokeStyle = "rgba(157,255,122,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, "📖 CÁCH CHƠI", CX, y0 + 32, 28, "#9dff7a", "center", 900);
    const colW = w / 2;
    rows.forEach(([icon, how, what], i) => {
      const col = i < half ? 0 : 1;
      const row = i < half ? i : i - half;
      const x = x0 + 24 + col * colW;
      const y = y0 + 80 + row * rh;
      const special = icon === "👑" || icon === "😈" || icon === "🌍";
      text(ctx, icon, x + 16, y, 26, "#fff", "center", 400);
      fitText(ctx, how, x + 40, y, 21, 190, special ? "#ffd55a" : "#ffffff", 800, "left");
      fitText(ctx, `→ ${what}`, x + 236, y, 20, colW - 260, special ? "#ffd55a" : "#ffe08a", 700, "left");
    });
  }

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
function fitText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, maxW: number, color: string, weight = 900, align: CanvasTextAlign = "center") {
  ctx.font = font(weight, size);
  ctx.letterSpacing = size >= 28 ? "1px" : "0px";
  const w = ctx.measureText(str).width;
  text(ctx, str, x, y, w > maxW ? Math.floor((size * maxW) / w) : size, color, align, weight);
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

