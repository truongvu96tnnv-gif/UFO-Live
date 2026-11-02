import { balanceFromQuery } from "./game/balance";
import { Game, type Phase } from "./game/game";
import { H, W } from "./game/stage";
import { DemoCrowd } from "./live/demo";
import type { LiveEvent, LiveUser } from "./live/events";
import { connectBridge } from "./live/socket";

const q = new URLSearchParams(location.search);
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
  "L: tim ×10 · C: bình luận · 1/2/3/4: quà (hoa hồng / 20💎 / 199💎 / 1000💎)",
  "F: follow · S: chia sẻ · J: thêm người xem giả",
  "D: bật/tắt người xem giả · [ ]: độ đông demo",
  "R: chơi lại từ đầu · B: vòng sau là UFO VÀNG · N: qua pha tiếp",
  "M: tắt/bật âm thanh · H: ẩn/hiện bảng này",
].join("\n");
let joinN = 0;
addEventListener("keydown", (e) => {
  game.sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === "h") help.style.display = help.style.display === "block" ? "none" : "block";
  else if (k === "l") sink({ type: "like", user: me, count: 10 });
  else if (k === "c") sink({ type: "chat", user: me, text: "bắn!!!" });
  else if (k === "1") sink({ type: "gift", user: me, gift: "Hoa hồng", diamonds: 1, count: 5 });
  else if (k === "2") sink({ type: "gift", user: me, gift: "Nước hoa", diamonds: 20, count: 1 });
  else if (k === "3") sink({ type: "gift", user: me, gift: "Kính râm", diamonds: 199, count: 1 });
  else if (k === "4") sink({ type: "gift", user: me, gift: "Thiên hà", diamonds: 1000, count: 1 });
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
    if (game.demo) demo.start();
    else demo.stop();
  } else if (k === "[") demo.level = Math.max(0, demo.level - 1);
  else if (k === "]") demo.level = Math.min(3, demo.level + 1);
});
addEventListener("pointerdown", () => game.sfx.unlock());

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
