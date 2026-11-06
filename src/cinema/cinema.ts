// Rạp Chiếu Phim Tương Tác: cả phòng live cùng "đạo diễn" một bộ phim nhiều nhánh.
//
//   chờ suất chiếu → chọn vai (2 người xem tương tác nhiều nhất đóng vai chính/phụ) → cảnh phim → CẢ RẠP BÌNH CHỌN 1/2
//   → công bố → cảnh tiếp … → CÁI KẾT (mở khoá bộ sưu tập kết) → danh đề cuối phim (đạo diễn, diễn viên, khán giả) → phim sau
//
// Người xem ngồi trong rạp (ảnh đại diện trên ghế). Tim = cổ vũ (bùng nổ không khí), bình luận cảm xúc = emoji,
// quà = bỏng ngô + phiếu vàng cho lựa chọn mình đã bình chọn (có trần, không mua được kết quả).
import { Avatars } from "../game/avatars";
import { font } from "../game/font";
import { canvas, type Img } from "../game/sprites";
import { H, W } from "../game/stage";
import { clamp, easeOutBack, hashStr, lerp, pick, rand } from "../game/math";
import type { LiveEvent, LiveUser } from "../live/events";
import { cleanChat, cleanName } from "../live/filter";
import { CinemaAudio } from "./audio";
import { fill, FILMS, type EndingKind, type Film, type Scene } from "./films";
import { drawBackground, drawCast, FH, FW, type CastMember } from "./scenery";
import { parseVote, reactionOf, VoteBox, type Pick } from "./votes";

export type CinemaPhase = "lobby" | "casting" | "scene" | "vote" | "reveal" | "ending" | "credits";

export interface CinemaConfig {
  lobby: number;
  vote: number;
  /** nhân hệ số thời gian đọc phụ đề */
  read: number;
}

export function cinemaConfigFromQuery(q: URLSearchParams): CinemaConfig {
  const num = (k: string, d: number, a: number, b: number) => clamp(Number(q.get(k) ?? d) || d, a, b);
  return { lobby: num("lobby", 20, 5, 120), vote: num("vote", 15, 6, 60), read: num("read", 1, 0.5, 2) };
}

/** khung màn chiếu trên sân khấu 1080×1920 */
const SX = 60;
const SY = 262;
const SEAT_TOP = 1180;
const ROWS = [
  { y: SEAT_TOP, s: 0.78, n: 9 },
  { y: SEAT_TOP + 112, s: 0.86, n: 8 },
  { y: SEAT_TOP + 232, s: 0.94, n: 8 },
  { y: SEAT_TOP + 360, s: 1.02, n: 7 },
  { y: SEAT_TOP + 495, s: 1.1, n: 7 },
  { y: SEAT_TOP + 635, s: 1.18, n: 6 },
];
interface Seat {
  x: number;
  y: number;
  s: number;
  row: number;
}
const SEATS: Seat[] = ROWS.flatMap((r, row) => Array.from({ length: r.n }, (_, i) => ({ x: W / 2 + (i - (r.n - 1) / 2) * (980 / r.n), y: r.y, s: r.s, row })));
/** ghế được xếp từ giữa ra, hàng trên (không bị khung chat TikTok che) trước */
const SEAT_ORDER = SEATS.map((_, i) => i).sort((a, b) => SEATS[a].row - SEATS[b].row || Math.abs(SEATS[a].x - W / 2) - Math.abs(SEATS[b].x - W / 2));

const ENDING_BADGE: Record<EndingKind, [string, string]> = {
  happy: ["🌈 KẾT CÓ HẬU", "#7dffb0"],
  funny: ["😂 KẾT HÀI", "#ffd55a"],
  sad: ["😭 KẾT BUỒN", "#8fb8ff"],
  twist: ["🌀 KẾT BẤT NGỜ", "#e08bff"],
};
const PICK_COLOR = ["#38d6ff", "#ff5fa2"] as const;

interface Viewer {
  user: LiveUser;
  name: string;
  seat: number;
  hue: number;
  /** điểm tương tác để chọn vai (reset khi đã được đóng vai) */
  score: number;
  lastAct: number;
  /** số lần chọn trùng với cả rạp trong phim này */
  agreed: number;
  gifted: number;
  vip: boolean;
  bubble?: { text: string; t: number };
  react?: { emoji: string; t: number };
  popcorn: number;
  lastChatScore: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: "heart" | "pop" | "confetti" | "emoji";
  color: string;
  text?: string;
  rot: number;
  size: number;
}

interface Banner {
  text: string;
  sub?: string;
  color: string;
  t: number;
  /** chỉ còn ý nghĩa trong pha này (vd. thông báo bình chọn) — sang pha khác thì bỏ */
  only?: CinemaPhase;
}

interface Saved {
  film: number;
  unlocked: Record<string, string[]>;
  shows: number;
}

const STORE_KEY = "ufo-live.cinema.v1";

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (raw && typeof raw === "object") return { film: +raw.film || 0, unlocked: raw.unlocked ?? {}, shows: +raw.shows || 0 };
  } catch {
    /* trình duyệt chặn lưu trữ: chơi bình thường, không nhớ */
  }
  return { film: 0, unlocked: {}, shows: 0 };
}

export class Cinema {
  readonly audio = new CinemaAudio();
  phase: CinemaPhase = "lobby";
  demo = false;
  showChat = true;
  private time = 0;
  private phaseT = 0;
  private phaseDur = 0;
  private saved = load();
  private film: Film = FILMS[this.saved.film % FILMS.length];
  private scene: Scene = this.film.scenes[this.film.start];
  private line = 0;
  private lineT = 0;
  private box = new VoteBox();
  private extended = false;
  private winner: { pick: Pick; tie: boolean } | null = null;
  /** lựa chọn của cả rạp trong suất này (cho danh đề) */
  private path: string[] = [];
  private viewers = new Map<string, Viewer>();
  private seats: (string | null)[] = SEATS.map(() => null);
  private avatars = new Avatars();
  private hero: { id: string | null; name: string; hue: number } = { id: null, name: "", hue: 200 };
  private friend: { id: string | null; name: string; hue: number } = { id: null, name: "", hue: 30 };
  private particles: Particle[] = [];
  private banners: Banner[] = [];
  private hype = 0;
  private hypeGoal = 200;
  private sceneFade = 0;
  private screenImg: Img;
  private sg: CanvasRenderingContext2D;
  private fallbackHeads = new Map<string, Img>();
  private lastTick = -1;
  private credits: { role: string; names: string[] }[] = [];
  private status = "";

  constructor(readonly cfg: CinemaConfig) {
    [this.screenImg, this.sg] = canvas(FW, FH);
    this.enter("lobby");
  }

  // ---------------- sự kiện live ----------------

  handle(e: LiveEvent) {
    if (e.type === "summonBoss") throw new Error("Rạp phim không có boss");
    if (e.type === "status") {
      this.status = e.state === "connected" ? "" : e.detail ?? e.state;
      if (e.state === "offline") for (const id of [...this.viewers.keys()]) this.removeViewer(id);
      return;
    }
    if (e.type === "control") {
      this.audio.muted = e.settings.muted;
      this.audio.musicOn = e.settings.music;
      if (e.settings.simulatedPlayers === 0) for (const id of [...this.viewers.keys()]) if (id.startsWith("sim:")) this.removeViewer(id);
      return;
    }
    if (e.type === "remove") {
      for (const id of e.ids) this.removeViewer(id);
      return;
    }
    const v = this.seat(e.user);
    if (!v) return;
    if (e.type === "presence" || e.type === "join") return;
    v.lastAct = this.time;
    const s = SEATS[v.seat];
    if (e.type === "like") {
      v.score += Math.min(3, e.count * 0.15);
      this.addHype(e.count * 0.4);
      for (let i = 0; i < Math.min(4, Math.ceil(e.count / 4)); i++) this.spawn("heart", s.x + rand(-20, 20), s.y - 40 * s.s, "#ff4f8b");
      this.audio.heart();
    } else if (e.type === "chat") {
      if (this.time - v.lastChatScore > 2) {
        v.score += 1.5;
        v.lastChatScore = this.time;
      }
      this.addHype(2);
      const vote = parseVote(e.text);
      if (vote !== null && this.phase === "vote") {
        const r = this.box.cast(v.user.id, vote);
        if (r !== "same") this.audio.vote(vote);
        this.spawn("emoji", s.x, s.y - 70 * s.s, PICK_COLOR[vote], vote === 0 ? "1️⃣" : "2️⃣");
        return;
      }
      const emo = reactionOf(e.text);
      if (emo) {
        v.react = { emoji: emo, t: this.time };
        this.spawn("emoji", s.x, s.y - 70 * s.s, "#fff", emo);
      }
      const clean = cleanChat(e.text);
      if (clean && this.showChat && vote === null) v.bubble = { text: clean, t: this.time };
    } else if (e.type === "gift" || e.type === "envelope") {
      const coins = e.type === "gift" ? e.coins * e.count : e.coins;
      v.gifted += coins;
      v.score += Math.min(30, Math.sqrt(coins) * 2);
      v.popcorn = this.time;
      this.addHype(coins * 0.8);
      this.audio.popcorn(Math.min(10, 3 + Math.floor(Math.sqrt(coins))));
      for (let i = 0; i < Math.min(30, 6 + coins / 4); i++) this.spawn("pop", s.x + rand(-30, 30), s.y - 50 * s.s, "#fff4c8");
      if (this.phase === "vote") {
        const gold = this.box.giftGold(v.user.id, coins);
        if (gold) this.banner(`⭐ ${v.name} +${gold} PHIẾU VÀNG`, `cho lựa chọn ${this.box.votes.get(v.user.id)! + 1}`, "#ffd55a", "vote");
        else if (!this.box.votes.has(v.user.id)) v.bubble = { text: "(bình luận 1 hoặc 2 để quà thành phiếu vàng)", t: this.time };
      }
      if (coins >= 100) {
        this.banner(`🎬 NHÀ SẢN XUẤT ${v.name}`, e.type === "gift" ? `tài trợ ${e.gift} cho bộ phim` : "tài trợ rương cho bộ phim", "#ffd55a");
        this.confetti(s.x, s.y - 60, 40);
      }
    } else if (e.type === "follow" || e.type === "share") {
      v.score += 5;
      v.vip = true;
      this.addHype(10);
      this.banner(e.type === "follow" ? `➕ ${v.name} đã theo dõi` : `↗ ${v.name} đã chia sẻ rạp`, "nhận ghế VIP 👑", "#ffd55a");
      this.confetti(s.x, s.y - 50, 18);
    }
  }

  private seat(user: LiveUser): Viewer | null {
    let v = this.viewers.get(user.id);
    if (v) {
      v.user = { ...v.user, ...user, avatar: user.avatar || v.user.avatar };
      return v;
    }
    let free = SEAT_ORDER.find((i) => this.seats[i] === null);
    if (free === undefined) {
      // rạp đầy: nhường ghế của người im lâu nhất (không phải người đang đóng vai)
      let worst: Viewer | null = null;
      for (const o of this.viewers.values()) if (o.user.id !== this.hero.id && o.user.id !== this.friend.id && (!worst || o.lastAct < worst.lastAct)) worst = o;
      if (!worst) return null;
      free = worst.seat;
      this.removeViewer(worst.user.id);
    }
    v = { user, name: cleanName(user.name, user.id), seat: free, hue: this.avatars.hue(user), score: 0, lastAct: this.time, agreed: 0, gifted: 0, vip: false, popcorn: -99, lastChatScore: -99 };
    this.viewers.set(user.id, v);
    this.seats[free] = user.id;
    return v;
  }

  private removeViewer(id: string) {
    const v = this.viewers.get(id);
    if (!v) return;
    this.seats[v.seat] = null;
    this.viewers.delete(id);
  }

  // ---------------- pha ----------------

  private enter(p: CinemaPhase, dur = 0) {
    this.phase = p;
    this.phaseT = 0;
    this.phaseDur = dur;
    if (p === "lobby") {
      this.phaseDur = this.cfg.lobby;
      this.audio.setMood("lobby");
      this.path = [];
      for (const v of this.viewers.values()) v.agreed = 0;
    } else if (p === "casting") {
      this.phaseDur = 5;
      this.castRoles();
      this.audio.chime();
    } else if (p === "vote") {
      this.phaseDur = this.cfg.vote;
      this.box = new VoteBox();
      this.extended = false;
      this.lastTick = -1;
      this.whoosh();
    } else if (p === "reveal") {
      this.phaseDur = 3.2;
      this.winner = this.box.winner();
      this.audio.drumroll(1.6);
    } else if (p === "ending") {
      this.phaseDur = 6.5;
      const end = this.scene.ending!;
      const list = (this.saved.unlocked[this.film.id] ??= []);
      if (!list.includes(this.scene.id)) list.push(this.scene.id);
      this.audio.ending(end.kind);
      this.audio.applause(3);
      this.confetti(W / 2, SY + 200, 80);
      this.store();
    } else if (p === "credits") {
      this.phaseDur = 13;
      this.buildCredits();
    }
  }

  private playScene(id: string) {
    this.scene = this.film.scenes[id];
    this.line = 0;
    this.lineT = 0;
    this.sceneFade = 0;
    this.enter("scene");
    this.audio.setMood(this.scene.mood);
  }

  private store() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.saved));
    } catch {
      /* không lưu được thì thôi */
    }
  }

  /** người xem điểm cao nhất đóng vai chính, người thứ hai vai phụ */
  private castRoles() {
    const ranked = [...this.viewers.values()].sort((a, b) => b.score - a.score || b.lastAct - a.lastAct);
    const [h, f] = ranked;
    const [fh, ff] = this.film.fallback;
    this.hero = h ? { id: h.user.id, name: h.name, hue: h.hue } : { id: null, name: fh, hue: 200 };
    this.friend = f ? { id: f.user.id, name: f.name, hue: f.hue } : { id: null, name: ff, hue: 30 };
    if (h) h.score = 0;
    if (f) f.score = 0;
  }

  private member(r: { id: string | null; name: string; hue: number }): CastMember {
    const v = r.id ? this.viewers.get(r.id) : undefined;
    if (v) return { name: r.name, hue: r.hue, head: this.avatars.get(v.user) };
    let head = this.fallbackHeads.get(r.name);
    if (!head) {
      head = this.avatars.get({ id: `cast:${r.name}`, name: r.name, avatar: `demo:${r.hue}` });
      this.fallbackHeads.set(r.name, head);
    }
    return { name: r.name, hue: r.hue, head };
  }

  private text(s: string) {
    return fill(s, this.hero.name, this.friend.name);
  }

  private lineDur(s: string) {
    return Math.max(2.8, 1.2 + [...s].length * 0.058) * this.cfg.read;
  }

  /** người vận hành: sang pha tiếp ngay (phím N) */
  skip() {
    if (this.phase === "scene") {
      this.line = this.scene.lines.length;
      this.lineT = 99;
    } else {
      this.extended = true; // người vận hành chốt luôn, không gia hạn bình chọn
      this.phaseT = this.phaseDur;
    }
  }

  /** người vận hành: đổi sang phim kế tiếp, về màn chờ (phím P) */
  nextFilm() {
    this.saved.film = (this.saved.film + 1) % FILMS.length;
    this.film = FILMS[this.saved.film];
    this.store();
    this.enter("lobby");
  }

  update(dt: number) {
    this.time += dt;
    this.phaseT += dt;
    this.audio.update();
    this.hype = Math.max(0, this.hype - dt * 2.5);
    this.sceneFade = Math.min(1, this.sceneFade + dt * 2);
    for (const v of this.viewers.values()) {
      if (v.bubble && this.time - v.bubble.t > 4) v.bubble = undefined;
      if (v.react && this.time - v.react.t > 2.5) v.react = undefined;
    }
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "confetti" || p.kind === "pop") p.vy += 900 * dt * (p.kind === "pop" ? 1 : 0.35);
      if (p.kind === "heart" || p.kind === "emoji") p.vx *= 0.97;
      p.rot += dt * 4;
      return p.life < p.max;
    });
    // thông báo hiện lần lượt từng cái, mỗi cái 2,4 s
    this.banners = this.banners.filter((b, i) => i === 0 || !b.only || b.only === this.phase);
    if (this.banners[0] && (this.time - this.banners[0].t > 2.4 || (this.banners[0].only && this.banners[0].only !== this.phase && this.time - this.banners[0].t > 0.6))) {
      this.banners.shift();
      if (this.banners[0]) this.banners[0].t = this.time;
    }

    switch (this.phase) {
      case "lobby":
        if (this.phaseT >= this.phaseDur) this.enter("casting");
        break;
      case "casting":
        if (this.phaseT >= this.phaseDur) {
          this.saved.shows++;
          this.store();
          this.playScene(this.film.start);
        }
        break;
      case "scene": {
        this.lineT += dt;
        const cur = this.scene.lines[this.line];
        if (cur !== undefined && this.lineT >= this.lineDur(this.text(cur))) {
          this.line++;
          this.lineT = 0;
        }
        if (this.line >= this.scene.lines.length && this.lineT >= 0.6) {
          if (this.scene.choice) this.enter("vote");
          else if (this.scene.ending) this.enter("ending");
          else if (this.scene.next) this.playScene(this.scene.next);
        }
        break;
      }
      case "vote": {
        const left = Math.ceil(this.phaseDur - this.phaseT);
        if (left <= 5 && left !== this.lastTick && left > 0) {
          this.lastTick = left;
          this.audio.tick(left <= 2);
        }
        if (this.phaseT >= this.phaseDur) {
          if (!this.box.voters && !this.extended) {
            // chưa ai chọn → cho thêm thời gian một lần
            this.extended = true;
            this.phaseDur += 8;
            this.banner("CHƯA AI CHỌN!", "bình luận 1 hoặc 2 để quyết định", "#ff5fa2", "vote");
          } else this.enter("reveal");
        }
        break;
      }
      case "reveal":
        if (this.phaseT >= 1.6 && this.phaseT - dt < 1.6) {
          this.audio.reveal();
          this.confetti(W / 2 + (this.winner!.pick === 0 ? -250 : 250), 1010, 30);
        }
        if (this.phaseT >= this.phaseDur) {
          const w = this.winner!.pick;
          for (const [id, p] of this.box.votes) if (p === w) this.viewers.get(id) && this.viewers.get(id)!.agreed++;
          const opt = this.scene.choice!.options[w];
          this.path.push(this.text(opt.label));
          this.playScene(opt.next);
        }
        break;
      case "ending":
        if (this.phaseT >= this.phaseDur) this.enter("credits");
        break;
      case "credits":
        if (this.phaseT >= this.phaseDur) this.nextFilm();
        break;
    }
  }

  private whoosh() {
    this.audio.whoosh();
  }

  private addHype(n: number) {
    this.hype += n;
    if (this.hype >= this.hypeGoal) {
      this.hype = 0;
      this.hypeGoal = Math.min(2000, this.hypeGoal * 1.35);
      this.banner("🔥 CẢ RẠP BÙNG NỔ!", "cảm ơn cả nhà đã thả tim", "#ff7a45");
      this.audio.applause(2.2);
      for (let i = 0; i < 4; i++) this.confetti(rand(150, W - 150), rand(1150, 1500), 18);
    }
  }

  private banner(text: string, sub: string | undefined, color: string, only?: CinemaPhase) {
    if (this.banners.some((b, i) => i > 0 && b.text === text)) return;
    this.banners.push({ text, sub, color, t: this.banners.length ? 0 : this.time, only });
    // dồn quá nhiều thì bỏ bớt thông báo cũ đang chờ (giữ cái đang hiện)
    if (this.banners.length > 4) this.banners.splice(1, 1);
  }

  private spawn(kind: Particle["kind"], x: number, y: number, color: string, text?: string) {
    if (this.particles.length > 500) return;
    const p: Particle = { x, y, vx: rand(-40, 40), vy: rand(-160, -110), life: 0, max: kind === "emoji" ? 1.8 : 1.4, kind, color, text, rot: rand(0, 6), size: rand(0.8, 1.2) };
    if (kind === "pop") {
      p.vx = rand(-260, 260);
      p.vy = rand(-620, -320);
      p.max = 1.1;
    }
    this.particles.push(p);
  }

  private confetti(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 500) return;
      const a = rand(0, Math.PI * 2);
      const sp = rand(200, 620);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 300, life: 0, max: rand(1.4, 2.4), kind: "confetti", color: `hsl(${(Math.random() * 360) | 0},90%,62%)`, rot: rand(0, 6), size: rand(0.7, 1.3) });
    }
  }

  private buildCredits() {
    const vs = [...this.viewers.values()];
    const directors = vs.filter((v) => v.agreed > 0).sort((a, b) => b.agreed - a.agreed).slice(0, 3).map((v) => v.name);
    const producers = vs.filter((v) => v.gifted > 0).sort((a, b) => b.gifted - a.gifted).slice(0, 6).map((v) => v.name);
    const cast = [this.hero.id, this.friend.id];
    const audience = vs.filter((v) => !cast.includes(v.user.id)).sort((a, b) => b.lastAct - a.lastAct).slice(0, 24).map((v) => v.name);
    this.credits = [
      { role: "VAI CHÍNH", names: [this.hero.name] },
      { role: "VAI PHỤ", names: [this.friend.name] },
      ...(directors.length ? [{ role: "ĐẠO DIỄN (chọn trúng ý cả rạp nhiều nhất)", names: directors }] : []),
      ...(producers.length ? [{ role: "NHÀ SẢN XUẤT", names: producers }] : []),
      { role: "HÀNH TRÌNH CẢ RẠP ĐÃ CHỌN", names: this.path.length ? this.path : ["—"] },
      ...(audience.length ? [{ role: "KHÁN GIẢ", names: audience }] : []),
      { role: "SUẤT TIẾP THEO", names: [FILMS[(this.saved.film + 1) % FILMS.length].title] },
    ];
  }

  // ---------------- vẽ ----------------

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    this.drawHall(ctx);
    this.drawScreen();
    // ánh sáng màn chiếu hắt xuống rạp
    const glow = ctx.createRadialGradient(W / 2, SY + FH / 2, 100, W / 2, SY + FH, 1100);
    glow.addColorStop(0, `hsla(${this.film.hue},70%,60%,0.16)`);
    glow.addColorStop(1, "hsla(0,0%,0%,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.screenImg, SX, SY);
    this.drawFrame(ctx);
    this.drawTop(ctx);
    this.drawPanel(ctx);
    this.drawSeats(ctx);
    this.drawParticles(ctx);
    this.drawBanners(ctx);
    if (this.status) {
      ctx.font = font(600, 22);
      ctx.fillStyle = "rgba(255,200,120,0.85)";
      ctx.textAlign = "center";
      ctx.fillText(`⚠ ${this.status}`, W / 2, 1150);
    }
    ctx.restore();
  }

  private drawHall(ctx: CanvasRenderingContext2D) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b0612");
    bg.addColorStop(0.45, "#150914");
    bg.addColorStop(1, "#07040a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // đèn tường
    for (const x of [40, W - 40]) {
      for (let i = 0; i < 3; i++) {
        const y = 1080 + i * 260;
        const l = ctx.createRadialGradient(x, y, 2, x, y, 90);
        l.addColorStop(0, "rgba(255,170,90,0.35)");
        l.addColorStop(1, "rgba(255,170,90,0)");
        ctx.fillStyle = l;
        ctx.fillRect(x - 90, y - 90, 180, 180);
      }
    }
  }

  private drawFrame(ctx: CanvasRenderingContext2D) {
    // viền màn
    ctx.strokeStyle = "#2a1a10";
    ctx.lineWidth = 10;
    ctx.strokeRect(SX - 5, SY - 5, FW + 10, FH + 10);
    // rèm nhung hai bên, mở ra lúc chiếu
    const open = this.phase === "lobby" ? 0.72 + 0.04 * Math.sin(this.time) : 1;
    const cw = lerp(250, 70, open);
    for (const side of [0, 1]) {
      ctx.save();
      if (side) {
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
      }
      const g = ctx.createLinearGradient(0, 0, cw + 30, 0);
      g.addColorStop(0, "#3d0610");
      g.addColorStop(0.5, "#8c1424");
      g.addColorStop(1, "#4a0812");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, SY - 60);
      ctx.lineTo(cw + 20, SY - 60);
      ctx.quadraticCurveTo(cw - 10, SY + FH / 2, cw + 30, SY + FH + 40);
      ctx.lineTo(0, SY + FH + 40);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 3;
      for (let i = 1; i < 5; i++) {
        const x = (cw * i) / 5;
        ctx.beginPath();
        ctx.moveTo(x, SY - 60);
        ctx.quadraticCurveTo(x - 12, SY + FH / 2, x + 10, SY + FH + 40);
        ctx.stroke();
      }
      ctx.restore();
    }
    // diềm trên
    ctx.fillStyle = "#6e0f1d";
    ctx.beginPath();
    ctx.moveTo(0, SY - 70);
    ctx.lineTo(W, SY - 70);
    ctx.lineTo(W, SY - 20);
    for (let i = 12; i >= 0; i--) ctx.quadraticCurveTo(i * 90 + 45, SY + 10, i * 90, SY - 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e0b04a";
    ctx.fillRect(0, SY - 72, W, 6);
  }

  private drawTop(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = font(700, 30);
    ctx.fillStyle = "#ffd55a";
    ctx.fillText(`🎬 RẠP PHIM LIVE · ${this.film.title}`, W / 2, 140);
    const got = this.saved.unlocked[this.film.id]?.length ?? 0;
    const total = Object.values(this.film.scenes).filter((s) => s.ending).length;
    ctx.font = font(600, 22);
    ctx.fillStyle = "rgba(232,238,255,0.75)";
    ctx.fillText(`🏆 Đã mở ${got}/${total} cái kết · ${this.viewers.size} khán giả trong rạp`, W / 2, 174);
  }

  // ---- màn chiếu ----

  private drawScreen() {
    const g = this.sg;
    g.save();
    g.clearRect(0, 0, FW, FH);
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (this.phase === "lobby") this.drawPoster(g);
    else if (this.phase === "casting") this.drawCasting(g);
    else if (this.phase === "credits") this.drawCredits(g);
    else {
      this.drawFilm(g);
      if (this.phase === "vote" || this.phase === "reveal") this.drawVoteOverlay(g);
      if (this.phase === "ending") this.drawEnding(g);
    }
    // vệt sáng máy chiếu: hạt bụi, nhấp nháy, viền tối
    const flick = 0.03 + 0.03 * Math.sin(this.time * 31) * Math.sin(this.time * 7);
    g.fillStyle = `rgba(255,255,240,${Math.max(0, flick)})`;
    g.fillRect(0, 0, FW, FH);
    g.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 18; i++) {
      const h = hashStr(`${Math.floor(this.time * 12)}:${i}`);
      g.fillRect(h % FW, (h >> 10) % FH, 2, 2);
    }
    const vg = g.createRadialGradient(FW / 2, FH / 2, FH * 0.4, FW / 2, FH / 2, FW * 0.7);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg;
    g.fillRect(0, 0, FW, FH);
    g.restore();
  }

  private drawFilm(g: CanvasRenderingContext2D) {
    const z = 1 + 0.05 * Math.min(1, this.phaseT / 20);
    g.save();
    g.translate(FW / 2, FH / 2);
    g.scale(z, z);
    g.translate(-FW / 2, -FH / 2);
    drawBackground(g, this.scene.bg, this.time);
    drawCast(g, this.scene.cast, this.time, this.member(this.hero), this.member(this.friend), this.scene.mood === "spooky" || this.scene.mood === "tense");
    g.restore();
    // khung phim điện ảnh
    g.fillStyle = "#000";
    g.fillRect(0, 0, FW, 26);
    g.fillRect(0, FH - 26, FW, 26);
    // phụ đề
    if (this.phase === "scene") {
      const shown = this.scene.lines.slice(0, Math.min(this.line + 1, this.scene.lines.length));
      const cur = shown.at(-1);
      if (cur) {
        const full = this.text(cur);
        const n = this.line < this.scene.lines.length ? Math.floor(this.lineT * 38) : [...full].length;
        this.subtitle(g, [...full].slice(0, n).join(""));
      }
    }
    if (this.sceneFade < 1) {
      g.fillStyle = `rgba(0,0,0,${1 - this.sceneFade})`;
      g.fillRect(0, 0, FW, FH);
    }
  }

  private subtitle(g: CanvasRenderingContext2D, s: string) {
    g.font = font(600, 34);
    const lines = wrap(g, s, FW - 120);
    const lh = 44;
    const y0 = FH - 50 - lines.length * lh;
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.beginPath();
    g.roundRect(40, y0 - 12, FW - 80, lines.length * lh + 22, 16);
    g.fill();
    g.fillStyle = "#fff";
    lines.forEach((l, i) => g.fillText(l, FW / 2, y0 + lh / 2 + i * lh));
  }

  private drawPoster(g: CanvasRenderingContext2D) {
    const f = this.film;
    const bg = g.createLinearGradient(0, 0, 0, FH);
    bg.addColorStop(0, `hsl(${f.hue},55%,14%)`);
    bg.addColorStop(1, `hsl(${(f.hue + 40) % 360},60%,6%)`);
    g.fillStyle = bg;
    g.fillRect(0, 0, FW, FH);
    // xem trước bối cảnh mở đầu, mờ ở nền
    g.globalAlpha = 0.35;
    drawBackground(g, f.scenes[f.start].bg, this.time);
    g.globalAlpha = 1;
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, 0, FW, FH);
    g.font = font(600, 26);
    g.fillStyle = "#ffd55a";
    g.fillText("SUẤT CHIẾU TIẾP THEO", FW / 2, 70);
    g.font = font(700, 74);
    g.fillStyle = "#fff";
    g.shadowColor = `hsl(${f.hue},90%,60%)`;
    g.shadowBlur = 30;
    g.fillText(f.title, FW / 2, 165, FW - 200);
    g.shadowBlur = 0;
    g.font = font(500, 30);
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillText(f.tagline, FW / 2, 235, FW - 200);
    g.font = font(600, 26);
    g.fillStyle = `hsl(${f.hue},80%,72%)`;
    g.fillText(f.genre, FW / 2, 280);
    const left = Math.max(0, Math.ceil(this.phaseDur - this.phaseT));
    g.font = font(700, 120);
    g.fillStyle = "#ffd55a";
    g.fillText(String(left), FW / 2, 395);
    g.font = font(600, 28);
    g.fillStyle = "#fff";
    g.fillText("💬 Bình luận để vào rạp nhận ghế", FW / 2, 490);
    g.fillStyle = "#ffd55a";
    g.fillText("🎭 Tương tác nhiều nhất → ĐÓNG VAI CHÍNH trong phim", FW / 2, 535, FW - 200);
  }

  private drawCasting(g: CanvasRenderingContext2D) {
    g.fillStyle = "#07060c";
    g.fillRect(0, 0, FW, FH);
    const t = this.phaseT;
    // vạch đếm ngược phim cổ
    g.strokeStyle = "rgba(255,255,255,0.15)";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(FW / 2, FH / 2, 280, -Math.PI / 2, -Math.PI / 2 + (t % 1) * Math.PI * 2);
    g.stroke();
    g.font = font(700, 40);
    g.fillStyle = "#ffd55a";
    g.fillText("🎭 PHÂN VAI", FW / 2, 70);
    const roles: [string, { id: string | null; name: string; hue: number }, number][] = [["VAI CHÍNH", this.hero, 0], ["VAI PHỤ", this.friend, 0.6]];
    roles.forEach(([role, r, delay], i) => {
      const p = clamp((t - 0.4 - delay) / 0.6, 0, 1);
      if (p <= 0) return;
      const x = FW * (i ? 0.72 : 0.28);
      const s = easeOutBack(p);
      const m = this.member(r);
      g.save();
      g.translate(x, 300);
      g.scale(s, s);
      const ring = g.createRadialGradient(0, 0, 60, 0, 0, 150);
      ring.addColorStop(0, `hsla(${r.hue},90%,60%,0.6)`);
      ring.addColorStop(1, `hsla(${r.hue},90%,60%,0)`);
      g.fillStyle = ring;
      g.fillRect(-150, -150, 300, 300);
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(0, 0, 104, 0, Math.PI * 2);
      g.fill();
      g.drawImage(m.head, -98, -98, 196, 196);
      g.restore();
      g.globalAlpha = p;
      g.font = font(600, 28);
      g.fillStyle = `hsl(${r.hue},85%,70%)`;
      g.fillText(role, x, 450);
      g.font = font(700, 40);
      g.fillStyle = "#fff";
      g.fillText(r.name, x, 500, FW / 2 - 40);
      g.globalAlpha = 1;
    });
    if (!this.hero.id) {
      g.font = font(500, 24);
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.fillText("(chưa có khán giả — bình luận để được đóng vai ở suất sau!)", FW / 2, 570);
    }
  }

  private drawVoteOverlay(g: CanvasRenderingContext2D) {
    g.fillStyle = "rgba(0,0,0,0.58)";
    g.fillRect(0, 0, FW, FH);
    const c = this.scene.choice!;
    g.font = font(600, 30);
    g.fillStyle = "#ffd55a";
    g.fillText(this.phase === "vote" ? "🎬 CẢ RẠP QUYẾT ĐỊNH" : "🥁 CẢ RẠP ĐÃ CHỌN…", FW / 2, 80);
    g.font = font(700, 50);
    g.fillStyle = "#fff";
    for (const [i, l] of wrap(g, this.text(c.prompt), FW - 100).entries()) g.fillText(l, FW / 2, 160 + i * 60);
    if (this.phase === "vote") {
      const left = Math.max(0, Math.ceil(this.phaseDur - this.phaseT));
      const pulse = left <= 5 ? 1 + 0.12 * Math.sin(this.phaseT * Math.PI * 2) : 1;
      g.save();
      g.translate(FW / 2, 330);
      g.scale(pulse, pulse);
      g.font = font(700, 110);
      g.fillStyle = left <= 5 ? "#ff5f6d" : "#fff";
      g.fillText(String(left), 0, 0);
      g.restore();
      g.font = font(700, 40);
      g.fillStyle = "#fff";
      g.fillText("BÌNH LUẬN  1  HOẶC  2", FW / 2, 450);
      g.font = font(500, 24);
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.fillText("đổi ý được · tặng quà sau khi chọn = ⭐ phiếu vàng", FW / 2, 500);
    } else {
      const w = this.winner!;
      if (this.phaseT >= 1.6) {
        const p = easeOutBack(clamp((this.phaseT - 1.6) / 0.5, 0, 1));
        g.save();
        g.translate(FW / 2, 370);
        g.scale(p, p);
        g.font = font(700, 64);
        g.fillStyle = PICK_COLOR[w.pick];
        g.fillText(`${w.pick + 1} · ${this.text(c.options[w.pick].label)}`, 0, 0, FW - 60);
        g.restore();
        if (w.tie) {
          g.font = font(500, 26);
          g.fillStyle = "rgba(255,255,255,0.75)";
          g.fillText(this.box.voters ? "(hoà phiếu — bốc thăm)" : "(không ai chọn — số phận tự quyết)", FW / 2, 450);
        }
      }
    }
  }

  private drawEnding(g: CanvasRenderingContext2D) {
    const end = this.scene.ending!;
    const p = clamp(this.phaseT / 0.8, 0, 1);
    g.fillStyle = `rgba(0,0,0,${0.7 * p})`;
    g.fillRect(0, 0, FW, FH);
    const [badge, color] = ENDING_BADGE[end.kind];
    g.globalAlpha = p;
    g.font = font(600, 32);
    g.fillStyle = color;
    g.fillText(badge, FW / 2, 180);
    g.save();
    g.translate(FW / 2, 280);
    const s = easeOutBack(clamp((this.phaseT - 0.3) / 0.6, 0, 1));
    g.scale(s, s);
    g.font = font(700, 72);
    g.fillStyle = "#fff";
    g.shadowColor = color;
    g.shadowBlur = 30;
    g.fillText(end.title, 0, 0, FW - 60);
    g.restore();
    const list = this.saved.unlocked[this.film.id] ?? [];
    const total = Object.values(this.film.scenes).filter((x) => x.ending).length;
    g.font = font(600, 30);
    g.fillStyle = "#ffd55a";
    g.fillText(`🏆 Cái kết ${list.indexOf(this.scene.id) + 1}/${total} đã mở khoá`, FW / 2, 390);
    g.font = font(500, 26);
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.fillText(list.length < total ? `Còn ${total - list.length} cái kết chưa ai thấy — suất sau chọn khác thử xem!` : "Cả rạp đã mở hết mọi cái kết! 🎉", FW / 2, 440, FW - 60);
    g.globalAlpha = 1;
  }

  private drawCredits(g: CanvasRenderingContext2D) {
    g.fillStyle = "#050409";
    g.fillRect(0, 0, FW, FH);
    const lh = 42;
    let total = 0;
    for (const c of this.credits) total += 60 + c.names.length * lh + 30;
    const speed = (total + FH) / this.phaseDur;
    let y = FH + 20 - this.phaseT * speed;
    g.font = font(700, 46);
    g.fillStyle = "#ffd55a";
    g.fillText(this.film.title, FW / 2, y);
    y += 90;
    for (const c of this.credits) {
      g.font = font(600, 24);
      g.fillStyle = "rgba(255,213,90,0.85)";
      g.fillText(c.role, FW / 2, y);
      y += 48;
      g.font = font(600, 32);
      g.fillStyle = "#fff";
      for (const n of c.names) {
        if (y > -40 && y < FH + 40) g.fillText(n, FW / 2, y, FW - 80);
        y += lh;
      }
      y += 30;
    }
  }

  // ---- bảng dưới màn: bình chọn / hướng dẫn ----

  private drawPanel(ctx: CanvasRenderingContext2D) {
    const top = SY + FH + 50;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if ((this.phase === "vote" || this.phase === "reveal") && this.scene.choice) {
      const [a, b] = this.box.totals();
      const sum = a + b;
      const roll = this.phase === "reveal" && this.phaseT < 1.6 ? (Math.floor(this.phaseT * 10) % 2) as Pick : null;
      const win = this.phase === "reveal" && this.phaseT >= 1.6 ? this.winner!.pick : null;
      for (const i of [0, 1] as Pick[]) {
        const x = i ? W / 2 + 12 : 40;
        const w = W / 2 - 52;
        const h = 170;
        const lit = roll === i || win === i;
        const dim = win !== null && win !== i;
        ctx.globalAlpha = dim ? 0.35 : 1;
        ctx.fillStyle = lit ? PICK_COLOR[i] + "44" : "rgba(10,12,26,0.88)";
        ctx.strokeStyle = PICK_COLOR[i];
        ctx.lineWidth = lit ? 6 : 3;
        ctx.beginPath();
        ctx.roundRect(x, top, w, h, 22);
        ctx.fill();
        ctx.stroke();
        // số
        ctx.fillStyle = PICK_COLOR[i];
        ctx.beginPath();
        ctx.arc(x + 52, top + 52, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#06070f";
        ctx.font = font(700, 44);
        ctx.fillText(String(i + 1), x + 52, top + 54);
        ctx.fillStyle = "#fff";
        ctx.font = font(700, 30);
        ctx.textAlign = "left";
        const lines = wrap(ctx, this.text(this.scene.choice.options[i].label), w - 110);
        lines.slice(0, 2).forEach((l, k) => ctx.fillText(l, x + 98, top + 40 + k * 34 + (lines.length === 1 ? 12 : 0)));
        ctx.textAlign = "center";
        // thanh %
        const pct = sum ? [a, b][i] / sum : 0;
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(x + 20, top + 112, w - 40, 18);
        ctx.fillStyle = PICK_COLOR[i];
        ctx.fillRect(x + 20, top + 112, (w - 40) * pct, 18);
        ctx.font = font(600, 24);
        ctx.fillStyle = "#fff";
        const gold = this.box.bonus[i];
        ctx.fillText(`${Math.round(pct * 100)}% · ${[a, b][i] - gold} phiếu${gold ? ` + ⭐${gold}` : ""}`, x + w / 2, top + 152);
        ctx.globalAlpha = 1;
      }
      return;
    }
    // hướng dẫn + thanh không khí
    ctx.fillStyle = "rgba(10,12,26,0.82)";
    ctx.beginPath();
    ctx.roundRect(40, top, W - 80, 170, 22);
    ctx.fill();
    ctx.font = font(600, 26);
    ctx.fillStyle = "#e8eeff";
    ctx.fillText("💬 Phim hỏi → bình luận 1 / 2 để chọn hướng đi", W / 2, top + 34);
    ctx.fillText("😂 😱 😭 bình luận cảm xúc · 🎁 quà = bỏng ngô + ⭐ phiếu vàng", W / 2, top + 72, W - 120);
    ctx.font = font(600, 22);
    ctx.fillStyle = "#ff9a6a";
    ctx.fillText("❤️ THẢ TIM CỔ VŨ — đầy thanh là CẢ RẠP BÙNG NỔ", W / 2, top + 110);
    const p = clamp(this.hype / this.hypeGoal, 0, 1);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(90, top + 132, W - 180, 18);
    const gr = ctx.createLinearGradient(90, 0, W - 90, 0);
    gr.addColorStop(0, "#ff4f8b");
    gr.addColorStop(1, "#ffb347");
    ctx.fillStyle = gr;
    ctx.fillRect(90, top + 132, (W - 180) * p, 18);
  }

  // ---- ghế & khán giả ----

  private drawSeats(ctx: CanvasRenderingContext2D) {
    const voting = this.phase === "vote" || this.phase === "reveal";
    for (let i = 0; i < SEATS.length; i++) {
      const s = SEATS[i];
      const id = this.seats[i];
      const v = id ? this.viewers.get(id) : undefined;
      const k = s.s;
      // lưng ghế
      const back = ctx.createLinearGradient(0, s.y - 70 * k, 0, s.y + 40 * k);
      back.addColorStop(0, v?.vip ? "#b8862a" : "#7a1222");
      back.addColorStop(1, v?.vip ? "#5a3a08" : "#3a0710");
      ctx.fillStyle = back;
      ctx.beginPath();
      ctx.roundRect(s.x - 52 * k, s.y - 72 * k, 104 * k, 120 * k, 22 * k);
      ctx.fill();
      if (v) {
        const isCast = id === this.hero.id || id === this.friend.id;
        const bob = Math.sin(this.time * 2 + i) * 2 + (v.react ? Math.abs(Math.sin((this.time - v.react.t) * 12)) * -8 : 0);
        const r = 40 * k;
        const hy = s.y - 20 * k + bob;
        const vote = voting ? this.box.votes.get(v.user.id) : undefined;
        ctx.fillStyle = vote !== undefined ? PICK_COLOR[vote] : isCast ? "#ffd55a" : "#fff";
        ctx.beginPath();
        ctx.arc(s.x, hy, r + (vote !== undefined || isCast ? 5 : 3) * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(this.avatars.get(v.user), s.x - r, hy - r, r * 2, r * 2);
        if (vote !== undefined) {
          ctx.fillStyle = PICK_COLOR[vote];
          ctx.beginPath();
          ctx.arc(s.x + r * 0.8, hy - r * 0.8, 16 * k, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#06070f";
          ctx.font = font(700, 20 * k);
          ctx.fillText(String(vote + 1), s.x + r * 0.8, hy - r * 0.78);
        }
        if (v.vip || isCast) {
          ctx.font = font(600, 26 * k);
          ctx.fillText(isCast ? "🎭" : "👑", s.x, hy - r - 12 * k);
        }
        if (this.time - v.popcorn < 8) {
          ctx.font = font(600, 30 * k);
          ctx.fillText("🍿", s.x + r * 0.95, hy + r * 0.7);
        }
      }
      // tay vịn + đệm
      ctx.fillStyle = "#2a050c";
      ctx.beginPath();
      ctx.roundRect(s.x - 58 * k, s.y + 26 * k, 116 * k, 30 * k, 10 * k);
      ctx.fill();
      if (v && s.row < 4) {
        ctx.font = font(600, 17 * k + 2);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText(short(v.name, 10), s.x, s.y + 42 * k);
      }
    }
    // bong bóng chat vẽ sau cùng để không bị ghế hàng sau che
    for (const v of this.viewers.values()) {
      if (!v.bubble) continue;
      const s = SEATS[v.seat];
      const age = this.time - v.bubble.t;
      ctx.globalAlpha = clamp(Math.min(age * 6, (4 - age) * 3), 0, 1);
      ctx.font = font(600, 22);
      const text = short(v.bubble.text, 28);
      const w = ctx.measureText(text).width + 26;
      const x = clamp(s.x, w / 2 + 10, W - w / 2 - 10);
      const y = s.y - 92 * s.s;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 22, w, 40, 14);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s.x - 8, y + 16);
      ctx.lineTo(s.x + 8, y + 16);
      ctx.lineTo(s.x, y + 28);
      ctx.fill();
      ctx.fillStyle = "#12131f";
      ctx.fillText(text, x, y - 1);
      ctx.globalAlpha = 1;
    }
    // đèn rọi vào ghế người đóng vai trong lúc phân vai
    if (this.phase === "casting") {
      for (const r of [this.hero, this.friend]) {
        const v = r.id ? this.viewers.get(r.id) : undefined;
        if (!v) continue;
        const s = SEATS[v.seat];
        const beam = ctx.createLinearGradient(0, SY + FH, 0, s.y);
        beam.addColorStop(0, "rgba(255,240,180,0)");
        beam.addColorStop(1, "rgba(255,240,180,0.35)");
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 20, SY + FH);
        ctx.lineTo(W / 2 + 20, SY + FH);
        ctx.lineTo(s.x + 70, s.y + 40);
        ctx.lineTo(s.x - 70, s.y + 40);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = clamp(a * 1.5, 0, 1);
      if (p.kind === "heart") {
        ctx.font = font(600, 34 * p.size);
        ctx.fillText("❤️", p.x + Math.sin(p.life * 6) * 8, p.y);
      } else if (p.kind === "emoji") {
        ctx.font = font(600, 50 * p.size);
        ctx.fillText(p.text ?? "", p.x, p.y);
      } else if (p.kind === "pop") {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7 * p.size, 0, Math.PI * 2);
        ctx.arc(p.x + 5, p.y - 4, 5 * p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-7 * p.size, -4 * p.size, 14 * p.size, 8 * p.size);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** 1 dải thông báo gọn trên diềm rèm — không che phim, bảng bình chọn hay khán giả */
  private drawBanners(ctx: CanvasRenderingContext2D) {
    const b = this.banners[0];
    if (!b) return;
    const age = this.time - b.t;
    const a = clamp(Math.min(age * 6, (2.4 - age) * 5), 0, 1);
    const y = SY - 36;
    ctx.globalAlpha = a;
    ctx.textBaseline = "middle";
    const main = font(700, 28);
    const subF = font(500, 21);
    ctx.font = main;
    const tw = ctx.measureText(b.text).width;
    ctx.font = subF;
    const sub = b.sub ? `  ·  ${b.sub}` : "";
    const sw = sub ? ctx.measureText(sub).width : 0;
    const w = Math.min(W - 40, tw + sw + 48);
    const k = Math.min(1, (W - 88) / (tw + sw));
    ctx.fillStyle = "rgba(6,7,15,0.94)";
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(W / 2 - w / 2, y - 27 + (1 - a) * -10, w, 54, 27);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.translate(W / 2 - ((tw + sw) * k) / 2, y + (1 - a) * -10);
    ctx.scale(k, k);
    ctx.textAlign = "left";
    ctx.font = main;
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, 0, 1);
    if (sub) {
      ctx.font = subF;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(sub, tw, 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ---------------- tiện ích cho trang thử ----------------

  get debug() {
    return { phase: this.phase, film: this.film.id, scene: this.scene.id, viewers: this.viewers.size, totals: this.box.totals(), hero: this.hero.name, friend: this.friend.name };
  }

  /** chọn ngẫu nhiên kiểu bình luận cho người xem giả lập */
  demoChat(): string {
    if (this.phase === "vote") return pick(["1", "2", "1", "2", "11111", "2️⃣", "số 1", "chọn 2!", "A", "b"]);
    return pick(["haha", "sợ quá", "hay quá", "😂😂", "wow", "khóc mất", "hóng quá", "ghê thế", "đỉnh", "cười xỉu", "bất ngờ ghê", "ủa gì vậy"]);
  }
}

function wrap(g: CanvasRenderingContext2D, s: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of s.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (g.measureText(next).width > max && cur) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function short(s: string, n: number) {
  const a = [...s];
  return a.length > n ? a.slice(0, n - 1).join("") + "…" : s;
}
