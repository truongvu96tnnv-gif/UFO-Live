import { balanceFromQuery } from "./game/balance";
import { GIFTS } from "./game/gifts";
import { Game, type Phase } from "./game/game";
import { H, W } from "./game/stage";
import { DemoCrowd } from "./live/demo";
import type { LiveEvent, LiveUser } from "./live/events";
import { connectBridge } from "./live/socket";
import { mountDemoPanel } from "./ui/panel";

// Bản nhúng (vd trang chơi thử) có thể đặt sẵn tham số qua window.UFO_PRESET thay cho query string
const preset = (window as unknown as { UFO_PRESET?: string }).UFO_PRESET;
const q = new URLSearchParams(preset ?? location.search);
const game = new Game(balanceFromQuery(q));
game.sfx.muted = q.get("mute") === "1";

const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d")!;

/** co giãn giữ tỉ lệ 9:16, nền đen hai bên (Browser Source 1080×1920 thì vừa khít) */
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = `${W * s}px`;
  canvas.style.height = `${H * s}px`;
  canvas.style.left = `${(innerWidth - W * s) / 2}px`;
  canvas.style.top = `${(innerHeight - H * s) / 2}px`;
}
addEventListener("resize", fit);
fit();

const sink = (e: LiveEvent) => game.handle(e);

// Nguồn sự kiện: ?demo=1 → người xem giả lập; mặc định → bridge TikTok qua WebSocket (cùng host, đường dẫn /ws)
const demo = new DemoCrowd(sink);
const demoOn = q.get("demo") === "1";
game.demo = demoOn;
if (demoOn) {
  demo.level = Math.min(3, Math.max(0, +(q.get("crowd") ?? 1) || 0));
  demo.start();
}
if (q.get("ws") !== "0" && !demoOn) {
  const url = q.get("ws") ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  connectBridge(url, sink);
}

// ---------------- phím tắt cho người vận hành (OBS: chuột phải Browser Source → Interact) ----------------
const me: LiveUser = { id: "host", name: "Chủ phòng", avatar: "demo:140" };
const help = document.getElementById("help")!;
help.innerHTML = [
  "<b>BẢO VỆ TRÁI ĐẤT</b> — phím tắt",
  "L: tim ×10 · C: bình luận · G: bảng quà · E: rương xu 199 xu",
  "Quà: 1 hoa hồng ×5 · 2 tim ngón tay · 3 nước hoa · 4 pháo giấy · 5 kính râm · 6 súng bắn tiền · 7 thiên hà · 8 vũ trụ",
  "F: follow · S: chia sẻ · J: thêm người xem giả",
  "D: bật/tắt người xem giả · [ ]: độ đông demo",
  "R: chơi lại từ đầu · B: vòng sau là UFO VÀNG · N: qua pha tiếp",
  "M: tắt/bật âm thanh · H: ẩn/hiện bảng này",
].join("\n");
const GIFT_KEYS: Record<string, [string, number]> = {
  "1": ["rose", 5],
  "2": ["fingerheart", 1],
  "3": ["perfume", 1],
  "4": ["confetti", 1],
  "5": ["sunglasses", 1],
  "6": ["moneygun", 1],
  "7": ["galaxy", 1],
  "8": ["universe", 1],
};
let joinN = 0;
addEventListener("keydown", (e) => {
  game.sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === "h") help.style.display = help.style.display === "block" ? "none" : "block";
  else if (k === "l") sink({ type: "like", user: me, count: 10 });
  else if (k === "c") sink({ type: "chat", user: me, text: "bắn!!!" });
  else if (GIFT_KEYS[k]) {
    const [key, count] = GIFT_KEYS[k];
    const g = GIFTS.find((x) => x.key === key)!;
    sink({ type: "gift", user: me, gift: g.name, coins: g.coins, count });
  } else if (k === "e") sink({ type: "envelope", user: me, coins: 199 });
  else if (k === "g") panel.toggleGifts();
  else if (k === "f") sink({ type: "follow", user: me });
  else if (k === "s") sink({ type: "share", user: me });
  else if (k === "j") sink({ type: "join", user: { id: `guest-${++joinN}`, name: `Khách ${joinN}`, avatar: `demo:${(joinN * 67) % 360}` } });
  else if (k === "r") game.restart();
  else if (k === "b") game.forceBoss();
  else if (k === "m") game.sfx.muted = !game.sfx.muted;
  else if (k === "n") {
    const order: Phase[] = ["intro", "battle", "win", "break"];
    game.debugPhase(order[(order.indexOf(game.phase) + 1) % order.length]);
  } else if (k === "d") {
    game.demo = !game.demo;
    panel.show(game.demo);
    if (game.demo) demo.start();
    else demo.stop();
  } else if (k === "[") demo.level = Math.max(0, demo.level - 1);
  else if (k === "]") demo.level = Math.min(3, demo.level + 1);
});
addEventListener("pointerdown", () => game.sfx.unlock());
// chế độ demo: chạm vào màn hình = thả tim, thanh nút + bảng quà để thử trên điện thoại
const you: LiveUser = { id: "you", name: "Bạn", avatar: "demo:200" };
const panel = mountDemoPanel(sink, you, () => game.sfx.unlock());
panel.show(game.demo);
canvas.addEventListener("pointerdown", () => {
  if (game.demo) sink({ type: "like", user: you, count: 5 });
});

// ---------------- vòng lặp ----------------
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// cho trang thử tự động / bảng chẩn đoán
(window as unknown as { __game: Game; __sink: typeof sink }).__game = game;
(window as unknown as { __sink: typeof sink }).__sink = sink;
