import type { ControlSettings, LiveEvent, LiveUser } from "../src/live/events";

export const DEFAULT_CONTROL: ControlSettings = { simulatedPlayers: 0, intensity: 1, muted: false, music: true };

export function parseControl(raw: unknown, current: ControlSettings): ControlSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Cấu hình không hợp lệ");
  const next = { ...current };
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (!Object.hasOwn(DEFAULT_CONTROL, key)) throw new Error("Tham số không hợp lệ");
    if (key === "simulatedPlayers" || key === "intensity") {
      const value = r[key];
      if (typeof value !== "number" || !Number.isInteger(value) || value < (key === "intensity" ? 1 : 0) || value > (key === "intensity" ? 3 : 20)) throw new Error("Số người: 0–20, nhịp tương tác: 1–3");
      next[key] = value;
    } else {
      if (typeof r[key] !== "boolean") throw new Error("Âm thanh phải là bật/tắt");
      next[key as "muted" | "music"] = r[key] as boolean;
    }
  }
  return next;
}

export const BOT_VIEWER_LIMIT = 20;
const BOT_NAMES = ["An", "Linh", "Minh", "Hà", "Nam", "Vy", "Khoa", "Mai", "Huy", "Ngọc", "Bảo", "Thảo", "Long", "Nhi", "Phúc", "Chi", "Quân", "My", "Đạt", "Yến"];
const BOT_CHATS = ["bắn nào!", "cố lên cả đội", "bảo vệ trái đất", "cùng bắn nhé", "UFO tới rồi", "thêm một loạt nữa", "giữ vững nào", "lên nào!"];

/** Independent rhythms, pauses and short chats; all players remain labelled simulations. */
export class SimulatedPlayers {
  private users: { user: LiveUser; nextAt: number; pace: number; chatIndex: number }[] = [];
  private time = 0;
  private intensity = 1;
  private viewers = 0;
  constructor(
    private emit: (event: LiveEvent) => void,
    private onAutoStop: () => void = () => {},
    private random: () => number = Math.random,
  ) {}

  observeViewers(count: number) {
    if (!Number.isFinite(count) || count < 0) return;
    this.viewers = count;
    if (count > BOT_VIEWER_LIMIT && this.users.length) {
      this.configure(0, this.intensity);
      this.onAutoStop();
    }
  }

  configure(count: number, intensity: number) {
    if (count > 0 && this.viewers > BOT_VIEWER_LIMIT) throw new Error("Đang có hơn 20 người xem thật: BOT đã bị tắt");
    this.intensity = intensity;
    if (count < this.users.length) this.emit({ type: "remove", ids: this.users.slice(count).map(p => p.user.id) });
    this.users.length = Math.min(count, this.users.length);
    while (this.users.length < count) {
      const n = this.users.length + 1;
      const user = { id: `sim:${n}`, name: `${BOT_NAMES[n - 1]} · BOT`, avatar: `demo:${n * 47 % 360}` };
      this.users.push({ user, nextAt: this.time + 0.2 + this.random() * 2.8, pace: 0.7 + this.random() * 0.8, chatIndex: n % BOT_CHATS.length });
      this.emit({ type: "join", user });
    }
  }

  tick(dt: number) {
    // Never replay a backlog of synthetic interactions after the server stalls.
    this.time += Math.max(0, Math.min(0.5, dt));
    const interval = [0, 0.8, 0.4, 0.2][this.intensity];
    for (const player of this.users) {
      if (this.time < player.nextAt) continue;
      if (this.random() < 0.12) {
        this.emit({ type: "chat", user: player.user, text: BOT_CHATS[player.chatIndex++ % BOT_CHATS.length] });
      } else {
        this.emit({ type: "like", user: player.user, count: 1 + Math.floor(this.random() * (this.intensity * 3)) });
      }
      const pause = this.random() < 0.15 ? 3 + this.random() * 5 : 0;
      player.nextAt = this.time + Math.max(0.3, this.users.length * interval * player.pace * (0.5 + this.random())) + pause;
    }
  }
}
