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

/** One simulation source on the bridge, shared by every game display. No simulated paid gifts. */
export class SimulatedPlayers {
  private users: LiveUser[] = [];
  private elapsed = 0;
  private cursor = 0;
  private intensity = 1;
  constructor(private emit: (event: LiveEvent) => void) {}
  configure(count: number, intensity: number) {
    this.intensity = intensity;
    if (count < this.users.length) this.emit({ type: "remove", ids: this.users.slice(count).map(u => u.id) });
    this.users.length = Math.min(count, this.users.length);
    while (this.users.length < count) {
      const n = this.users.length + 1;
      const user = { id: `sim:${n}`, name: `BOT ${n} · mô phỏng`, avatar: `demo:${n * 47 % 360}` };
      this.users.push(user);
      this.emit({ type: "join", user });
    }
    this.elapsed = 0;
  }
  tick(dt: number) {
    if (!this.users.length) return;
    this.elapsed += dt;
    const interval = [0, 0.8, 0.4, 0.2][this.intensity];
    if (this.elapsed < interval) return;
    this.elapsed %= interval;
    const user = this.users[this.cursor++ % this.users.length];
    this.emit({ type: "like", user, count: this.intensity * 2 });
  }
}
