import type { EventSink, LiveUser } from "./events";

const NAMES = [
  "Minh Anh", "Gia Huy", "Bảo Ngọc", "Tuấn Kiệt", "Thu Trang", "Hoàng Long", "Khánh Linh", "Đức Thắng", "Mai Phương", "Quốc Bảo",
  "Ngọc Hân", "Văn Toàn", "Phương Vy", "Thành Đạt", "Hà My", "Nhật Nam", "Tú Uyên", "Hải Đăng", "Yến Nhi", "Trọng Nhân",
  "Lan Chi", "Minh Khôi", "Thảo Vy", "Đăng Khoa", "Bích Ngân", "Anh Thư", "Công Phượng", "Kim Ngân", "Trung Hiếu", "Diệu Linh",
  "Phúc Lâm", "Thu Hà", "Việt Hoàng", "Như Quỳnh", "Tấn Phát", "Hồng Nhung", "Gia Bảo", "Quỳnh Anh", "Đình Trọng", "Mỹ Duyên",
];
const CHATS = ["bắn!!!", "bắn nó điii", "🚀🚀🚀", "cứu trái đất", "lên anh em", "sắp chạm đất rồi", "fire", "thả tim đi mọi người", "UFO yếu quá", "haha", "hạ nó!", "cố lên"];
/** quà demo: tên, kim cương, độ phổ biến */
const GIFTS = [
  ["Hoa hồng", 1, 60],
  ["TikTok", 1, 20],
  ["Tim ngón tay", 5, 12],
  ["Nước hoa", 20, 5],
  ["Kính râm", 199, 1.5],
  ["Thiên hà", 1000, 0.25],
] as const;

/**
 * Giả lập người xem để thử game không cần lên live.
 * level 0 = vắng, 1 = vừa, 2 = sôi động, 3 = bùng nổ. Phím [ ] để đổi.
 */
export class DemoCrowd {
  level = 1;
  private users: LiveUser[] = [];
  private present = new Set<number>();
  private timer = 0;

  constructor(private sink: EventSink) {
    this.users = NAMES.map((name, i) => ({ id: `demo-${i}`, name, avatar: `demo:${(i * 47) % 360}` }));
  }

  start() {
    this.stop();
    let last = performance.now();
    this.timer = window.setInterval(() => {
      const now = performance.now();
      this.tick(Math.min(0.5, (now - last) / 1000));
      last = now;
    }, 100);
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
  }

  private rate(base: number) {
    return base * [0.15, 1, 2.2, 4.5][this.level];
  }

  private someone(): LiveUser {
    const ids = [...this.present];
    return this.users[ids.length ? ids[(Math.random() * ids.length) | 0] : 0];
  }

  private tick(dt: number) {
    const crowd = [4, 14, 26, 40][this.level];
    // người vào / ra
    if (this.present.size < crowd && Math.random() < dt * 3) {
      const i = (Math.random() * this.users.length) | 0;
      if (!this.present.has(i)) {
        this.present.add(i);
        this.sink({ type: "join", user: this.users[i] });
      }
    }
    if (this.present.size > crowd && Math.random() < dt * 2) this.present.delete([...this.present][0]);
    if (!this.present.size) return;
    if (Math.random() < dt * this.rate(5)) this.sink({ type: "like", user: this.someone(), count: 1 + ((Math.random() * 12) | 0) });
    if (Math.random() < dt * this.rate(0.8)) this.sink({ type: "chat", user: this.someone(), text: CHATS[(Math.random() * CHATS.length) | 0] });
    if (Math.random() < dt * this.rate(0.12)) {
      const total = GIFTS.reduce((s, g) => s + g[2], 0);
      let r = Math.random() * total;
      const g = GIFTS.find((x) => (r -= x[2]) < 0) ?? GIFTS[0];
      this.sink({ type: "gift", user: this.someone(), gift: g[0], diamonds: g[1], count: g[1] < 10 ? 1 + ((Math.random() * 5) | 0) : 1 });
    }
    if (Math.random() < dt * this.rate(0.03)) this.sink({ type: "follow", user: this.someone() });
    if (Math.random() < dt * this.rate(0.02)) this.sink({ type: "share", user: this.someone() });
  }
}
