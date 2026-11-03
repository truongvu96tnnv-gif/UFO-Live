// Trình phát lồng tiếng: đọc danh sách file có sẵn (voice/manifest.json do bridge tạo từ thư mục voice/),
// tải & giải mã trước, phát theo key với ưu tiên + hàng đợi 1 câu, hạ nhạc nền khi đang nói.
// Thiếu file → im lặng (game vẫn chạy bình thường), nên có thể thêm tiếng dần dần.

import type { Engine } from "./engine";
import { linesFor, type VoiceLine } from "../voice-lines";

interface Playing {
  line: VoiceLine;
  src: AudioBufferSourceNode;
  g: GainNode;
}

export class VoicePlayer {
  private files = new Map<string, string>(); // file id → đường dẫn
  private bufs = new Map<string, AudioBuffer>();
  private loading = new Set<string>();
  private lastKey = new Map<string, number>();
  private lastFile = new Map<string, string>();
  private cur: Playing | null = null;
  /** hàng chờ tối đa 3 câu (ưu tiên cao trước, câu chờ quá 6 giây thì bỏ) */
  private queue: { key: string; at: number; prio: number }[] = [];
  private bus: GainNode;
  private ready = false;

  constructor(private e: Engine, level: number) {
    this.bus = e.gain(level, e.master);
    void this.loadManifest();
  }

  set level(v: number) {
    this.bus.gain.setTargetAtTime(v, this.e.now, 0.05);
  }

  /** số file lồng tiếng đang có (để hiện ở bảng trợ giúp / kiểm tra) */
  get count() {
    return this.files.size;
  }

  private async loadManifest() {
    // mở file HTML trực tiếp (file://) thì không có bridge → không lồng tiếng, khỏi báo lỗi
    if (location.protocol === "file:") return;
    try {
      const r = await fetch("voice/manifest.json", { cache: "no-store" });
      if (!r.ok) return;
      const m = (await r.json()) as { files?: string[] };
      for (const f of m.files ?? []) {
        const id = f.replace(/\.[a-z0-9]+$/i, "");
        this.files.set(id, `voice/${encodeURIComponent(f)}`);
      }
      this.ready = true;
      // giải mã dần từng file (nhẹ, tránh tải ồ ạt lúc vào game)
      for (const id of this.files.keys()) await this.load(id);
    } catch {
      /* không có bridge / chạy file HTML offline → không lồng tiếng */
    }
  }

  private async load(id: string) {
    if (this.bufs.has(id) || this.loading.has(id)) return;
    const url = this.files.get(id);
    if (!url) return;
    this.loading.add(id);
    try {
      const data = await (await fetch(url)).arrayBuffer();
      this.bufs.set(id, await this.e.ctx.decodeAudioData(data));
    } catch {
      this.files.delete(id);
    } finally {
      this.loading.delete(id);
    }
  }

  /** phát 1 câu theo key; trả về true nếu đã phát / đã xếp hàng */
  say(key: string): boolean {
    if (!this.ready) return false;
    const now = this.e.now;
    const all = linesFor(key).filter((l) => this.files.has(l.file));
    if (!all.length) return false;
    const cd = all[0].cd ?? 0;
    if (now - (this.lastKey.get(key) ?? -1e9) < cd) return false;
    const prio = all[0].prio;
    if (this.cur) {
      if (this.cur.line.prio >= prio) {
        // đang nói câu quan trọng hơn/ngang → xếp hàng (vd. "Trùm xuất hiện!" → câu khiêu khích của trùm → "Khai hoả!")
        if (this.queue.some((q) => q.key === key)) return true;
        this.queue.push({ key, at: now, prio });
        this.queue.sort((a, b) => b.prio - a.prio);
        if (this.queue.length > 3) this.queue.length = 3;
        return true;
      }
      this.stop(0.06);
    }
    const ready = all.filter((l) => this.bufs.has(l.file));
    if (!ready.length) {
      for (const l of all) void this.load(l.file);
      return false;
    }
    const fresh = ready.filter((l) => l.file !== this.lastFile.get(key));
    const line = (fresh.length ? fresh : ready)[Math.floor(Math.random() * (fresh.length ? fresh : ready).length)];
    this.lastKey.set(key, now);
    this.lastFile.set(key, line.file);
    this.play(line);
    return true;
  }

  private play(line: VoiceLine) {
    const e = this.e;
    const t = e.now + 0.02;
    const src = e.ctx.createBufferSource();
    src.buffer = this.bufs.get(line.file)!;
    // giọng trùm vang hơn (phòng vang chung), bình luận viên khô & rõ
    const g = e.gain(1, this.bus, line.speaker === "ufo" ? 0.35 : 0.06);
    src.connect(g);
    src.start(t);
    // hạ nhạc nền & hiệu ứng khi đang nói cho rõ chữ
    for (const [n, v] of [[e.musicDuck, 0.38], [e.sfxDuck, 0.72]] as const) {
      n.gain.cancelScheduledValues(t);
      n.gain.setTargetAtTime(v, t, 0.06);
    }
    const cur: Playing = { line, src, g };
    this.cur = cur;
    src.onended = () => {
      if (this.cur !== cur) return;
      this.cur = null;
      while (this.queue.length) {
        const q = this.queue.shift()!;
        if (e.now - q.at < 6 && this.say(q.key)) return;
      }
      e.musicDuck.gain.setTargetAtTime(1, e.now, 0.35);
      e.sfxDuck.gain.setTargetAtTime(1, e.now, 0.25);
    };
  }

  private stop(fade: number) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    const t = this.e.now;
    c.g.gain.setTargetAtTime(0, t, fade / 3);
    try {
      c.src.stop(t + fade);
    } catch {
      /* đã dừng */
    }
  }

  /** dừng hết (đổi trận gấp / tắt tiếng) */
  clear() {
    this.queue = [];
    this.stop(0.1);
  }
}
